"""
iyzico Checkout Form — paket satin alma.
Env:
  IYZICO_API_KEY, IYZICO_SECRET_KEY
  IYZICO_BASE_URL=sandbox-api.iyzipay.com  (prod: api.iyzipay.com)
  IYZICO_CALLBACK_URL=https://speakking.lim10.tr/api/payments/iyzico/callback
  APP_PUBLIC_URL=https://speakking.lim10.tr
"""
from __future__ import annotations

import json
import logging
import os
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, Optional

import iyzipay
from fastapi import APIRouter, Depends, Form, HTTPException, Request
from fastapi.responses import RedirectResponse
from pydantic import BaseModel

logger = logging.getLogger(__name__)

payments_router = APIRouter(prefix="/payments", tags=["payments"])


def _iyzico_options() -> Dict[str, str]:
    api_key = (os.environ.get("IYZICO_API_KEY") or "").strip()
    secret = (os.environ.get("IYZICO_SECRET_KEY") or "").strip()
    base = (os.environ.get("IYZICO_BASE_URL") or "sandbox-api.iyzipay.com").strip()
    base = base.replace("https://", "").replace("http://", "").rstrip("/")
    if not api_key or not secret:
        raise HTTPException(
            503,
            detail="iyzico yapilandirilmadi. IYZICO_API_KEY ve IYZICO_SECRET_KEY ekleyin.",
        )
    return {"api_key": api_key, "secret_key": secret, "base_url": base}


def _public_url() -> str:
    return (
        os.environ.get("APP_PUBLIC_URL")
        or os.environ.get("REACT_APP_PUBLIC_URL")
        or "http://localhost:3000"
    ).rstrip("/")


def _callback_url() -> str:
    explicit = (os.environ.get("IYZICO_CALLBACK_URL") or "").strip()
    if explicit:
        return explicit
    # Backend ayni origin /api
    return f"{_public_url()}/api/payments/iyzico/callback"


def _price_str(amount: float) -> str:
    return f"{float(amount):.2f}"


def _parse_iyzico_response(result: Any) -> Dict[str, Any]:
    """iyzipay SDK file-like veya str doner."""
    if result is None:
        return {}
    if isinstance(result, dict):
        return result
    raw = result
    if hasattr(result, "read"):
        raw = result.read()
    if isinstance(raw, bytes):
        raw = raw.decode("utf-8")
    if isinstance(raw, str):
        return json.loads(raw)
    return json.loads(str(raw))


class CheckoutInitIn(BaseModel):
    package_code: str
    buyer_name: Optional[str] = None
    buyer_surname: Optional[str] = None
    buyer_phone: Optional[str] = None
    buyer_identity: Optional[str] = None
    buyer_city: Optional[str] = "Istanbul"
    buyer_address: Optional[str] = None


def register_payment_routes(api_router, sb, get_current_user, get_admin_user):
    """ai_server icinden baglanir — sb = supabase client."""

    def _load_package(code: str) -> Dict[str, Any]:
        rows = (
            sb.table("packages")
            .select("*")
            .eq("code", code)
            .eq("is_active", True)
            .limit(1)
            .execute()
            .data
            or []
        )
        if not rows:
            raise HTTPException(404, detail="Paket bulunamadi veya aktif degil")
        return rows[0]

    def _fulfill_order(order: Dict[str, Any], payment_id: str = "") -> None:
        """Odeme basarili — kota uygula (idempotent)."""
        if order.get("status") == "paid":
            return
        user_id = order["user_id"]
        pkg_type = order.get("package_type") or "subscription"
        minutes = int(order.get("daily_minutes") or 0)
        now = datetime.now(timezone.utc).isoformat()

        prof = (
            sb.table("profiles")
            .select("daily_limit_minutes")
            .eq("id", user_id)
            .single()
            .execute()
            .data
            or {}
        )
        current = int(prof.get("daily_limit_minutes") or 30)

        if pkg_type == "addon":
            new_limit = current + max(0, minutes)
        else:
            # Abonelik: gunluk dakikayi paket degerine cek (daha yuksekse koru)
            new_limit = max(current, minutes) if minutes else current

        sb.table("profiles").update({"daily_limit_minutes": new_limit}).eq(
            "id", user_id
        ).execute()

        sb.table("payment_orders").update(
            {
                "status": "paid",
                "iyzico_payment_id": payment_id or order.get("iyzico_payment_id") or "",
                "paid_at": now,
                "updated_at": now,
                "error_message": "",
            }
        ).eq("id", order["id"]).execute()
        logger.info(
            "Payment fulfilled order=%s user=%s limit=%s",
            order.get("conversation_id"),
            user_id,
            new_limit,
        )

    @payments_router.post("/iyzico/initialize")
    async def iyzico_initialize(
        body: CheckoutInitIn, user: Dict = Depends(get_current_user)
    ):
        pkg = _load_package(body.package_code.strip())
        amount = float(pkg.get("price_tl") or 0)
        if amount <= 0:
            raise HTTPException(400, detail="Paket fiyati gecersiz")

        conversation_id = str(uuid.uuid4())
        name = (body.buyer_name or user.get("name") or "SpeakKing").strip() or "SpeakKing"
        parts = name.split(None, 1)
        buyer_name = parts[0][:50]
        buyer_surname = (parts[1] if len(parts) > 1 else "Kullanici")[:50]
        if body.buyer_surname:
            buyer_surname = body.buyer_surname.strip()[:50]
        email = (user.get("email") or "musteri@speakking.com").strip()
        phone = (body.buyer_phone or "+905350000000").strip()
        identity = (body.buyer_identity or "11111111111").strip()
        city = (body.buyer_city or "Istanbul").strip()
        address = (
            body.buyer_address or "SpeakKing dijital paket"
        ).strip()[:200]

        order_row = {
            "user_id": user["id"],
            "package_id": pkg.get("id"),
            "package_code": pkg["code"],
            "package_name": pkg.get("name") or pkg["code"],
            "package_type": pkg.get("package_type") or "subscription",
            "amount_tl": amount,
            "daily_minutes": int(pkg.get("daily_minutes") or 0),
            "status": "pending",
            "conversation_id": conversation_id,
        }
        try:
            inserted = (
                sb.table("payment_orders").insert(order_row).select("*").single().execute()
            )
            order = inserted.data
        except Exception as e:
            logger.error("payment_orders insert failed: %s", e)
            raise HTTPException(
                500,
                detail="Siparis kaydedilemedi. SQL: supabase/payment-orders.sql calistirin.",
            )

        buyer = {
            "id": str(user["id"]).replace("-", "")[:11] or "SK000000001",
            "name": buyer_name,
            "surname": buyer_surname,
            "gsmNumber": phone if phone.startswith("+") else f"+90{phone.lstrip('0')}",
            "email": email,
            "identityNumber": identity,
            "registrationAddress": address,
            "ip": "85.34.78.112",
            "city": city,
            "country": "Turkey",
        }
        addr = {
            "contactName": f"{buyer_name} {buyer_surname}",
            "city": city,
            "country": "Turkey",
            "address": address,
        }
        basket_items = [
            {
                "id": str(pkg.get("code") or "PKG")[:64],
                "name": (pkg.get("name") or "Paket")[:100],
                "category1": "SpeakKing",
                "category2": pkg.get("package_type") or "subscription",
                "itemType": "VIRTUAL",
                "price": _price_str(amount),
            }
        ]
        request = {
            "locale": "tr",
            "conversationId": conversation_id,
            "price": _price_str(amount),
            "paidPrice": _price_str(amount),
            "currency": "TRY",
            "basketId": conversation_id[:32],
            "paymentGroup": "PRODUCT",
            "callbackUrl": _callback_url(),
            "enabledInstallments": ["1", "2", "3", "6"],
            "buyer": buyer,
            "shippingAddress": addr,
            "billingAddress": addr,
            "basketItems": basket_items,
        }

        try:
            options = _iyzico_options()
            result = iyzipay.CheckoutFormInitialize().create(request, options)
            response = _parse_iyzico_response(result)
        except HTTPException:
            raise
        except Exception as e:
            logger.exception("iyzico initialize error")
            sb.table("payment_orders").update(
                {
                    "status": "failed",
                    "error_message": str(e)[:400],
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                }
            ).eq("id", order["id"]).execute()
            raise HTTPException(502, detail=f"iyzico baslatilamadi: {e}")

        if response.get("status") != "success":
            err = response.get("errorMessage") or response.get("errorCode") or "iyzico hata"
            sb.table("payment_orders").update(
                {
                    "status": "failed",
                    "error_message": str(err)[:400],
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                }
            ).eq("id", order["id"]).execute()
            raise HTTPException(400, detail=str(err))

        token = response.get("token") or ""
        sb.table("payment_orders").update(
            {
                "iyzico_token": token,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }
        ).eq("id", order["id"]).execute()

        return {
            "success": True,
            "conversation_id": conversation_id,
            "token": token,
            "payment_page_url": response.get("paymentPageUrl") or "",
            "checkout_form_content": response.get("checkoutFormContent") or "",
            "amount_tl": amount,
            "package_name": pkg.get("name"),
        }

    @payments_router.post("/iyzico/callback")
    async def iyzico_callback(request: Request, token: str = Form(default="")):
        """iyzico POST callback — sonucu dogrula, kotayi uygula, frontend'e yonlendir."""
        form = await request.form()
        token = (token or form.get("token") or "").strip()
        public = _public_url()
        if not token:
            return RedirectResponse(f"{public}/payment?status=failed&reason=token", status_code=303)

        try:
            options = _iyzico_options()
            result = iyzipay.CheckoutForm().retrieve(
                {"locale": "tr", "token": token}, options
            )
            response = _parse_iyzico_response(result)
        except Exception as e:
            logger.exception("iyzico retrieve failed")
            return RedirectResponse(
                f"{public}/payment?status=failed&reason=retrieve", status_code=303
            )

        conversation_id = response.get("conversationId") or ""
        payment_status = (response.get("paymentStatus") or "").upper()
        status_ok = response.get("status") == "success" and payment_status == "SUCCESS"

        rows = (
            sb.table("payment_orders")
            .select("*")
            .eq("conversation_id", conversation_id)
            .limit(1)
            .execute()
            .data
            or []
        )
        if not rows and token:
            rows = (
                sb.table("payment_orders")
                .select("*")
                .eq("iyzico_token", token)
                .limit(1)
                .execute()
                .data
                or []
            )

        if not rows:
            return RedirectResponse(
                f"{public}/payment?status=failed&reason=order", status_code=303
            )

        order = rows[0]
        if status_ok:
            try:
                _fulfill_order(order, str(response.get("paymentId") or ""))
            except Exception as e:
                logger.exception("fulfill failed: %s", e)
                return RedirectResponse(
                    f"{public}/payment?status=failed&reason=fulfill", status_code=303
                )
            return RedirectResponse(
                f"{public}/payment?status=success&order={conversation_id}",
                status_code=303,
            )

        err = response.get("errorMessage") or payment_status or "odeme basarisiz"
        sb.table("payment_orders").update(
            {
                "status": "failed",
                "error_message": str(err)[:400],
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }
        ).eq("id", order["id"]).execute()
        return RedirectResponse(
            f"{public}/payment?status=failed&reason=declined", status_code=303
        )

    @payments_router.get("/orders/me")
    async def my_orders(user: Dict = Depends(get_current_user)):
        rows = (
            sb.table("payment_orders")
            .select("*")
            .eq("user_id", user["id"])
            .order("created_at", desc=True)
            .limit(50)
            .execute()
            .data
            or []
        )
        return {"orders": rows}

    @payments_router.get("/orders")
    async def admin_orders(user: Dict = Depends(get_admin_user)):
        rows = (
            sb.table("payment_orders")
            .select("*")
            .order("created_at", desc=True)
            .limit(100)
            .execute()
            .data
            or []
        )
        return {"orders": rows}

    @payments_router.get("/iyzico/status")
    async def iyzico_status(user: Dict = Depends(get_admin_user)):
        configured = bool(
            (os.environ.get("IYZICO_API_KEY") or "").strip()
            and (os.environ.get("IYZICO_SECRET_KEY") or "").strip()
        )
        return {
            "configured": configured,
            "base_url": (os.environ.get("IYZICO_BASE_URL") or "sandbox-api.iyzipay.com"),
            "callback_url": _callback_url(),
            "public_url": _public_url(),
        }

    api_router.include_router(payments_router)
