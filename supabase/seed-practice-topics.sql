-- Pratik konulari ekler (A1/A2) + mevcut konulari modullere baglar
-- Supabase Studio → SQL Editor → Run

-- A1 alt kutulari (yoksa)
insert into public.curriculum_modules (category_code, name_tr, name_en, sort_order)
values
  ('A1', 'Başlangıç', 'Beginner Track', 1),
  ('A1', 'Gelişmiş', 'Advanced Track', 2),
  ('A2', 'Genel', 'General', 0)
on conflict (category_code, name_tr) do nothing;

-- Mevcut konulari A1 Genel/Baslangic modulune bagla (module_id bos olanlar)
update public.scenarios s
set module_id = m.id
from public.curriculum_modules m
where s.module_id is null
  and s.level = m.category_code
  and m.name_tr = case
    when s.level = 'A1' then 'Başlangıç'
    else 'Genel'
  end;

-- === Yeni pratik konular (A1 Başlangıç) ===
insert into public.scenarios (level, title, title_tr, description, description_tr, topics, is_active, module_id)
select v.level, v.title, v.title_tr, v.description, v.description_tr, v.topics::jsonb, true, m.id
from (values
  ('A1', 'At the Cafe', 'Kafede Sipariş', 'Order drinks and snacks at a cafe', 'Kafede içecek ve atıştırmalık sipariş verme', '["coffee", "tea", "menu", "bill", "please"]'),
  ('A1', 'Asking Directions', 'Yol Tarifi', 'Ask for and understand simple directions', 'Basit yol tarifi sorma ve anlama', '["left", "right", "straight", "near", "where"]'),
  ('A1', 'Weather Talk', 'Hava Durumu', 'Talk about the weather and seasons', 'Hava durumu ve mevsimler hakkında konuşma', '["sunny", "rainy", "cold", "hot", "today"]'),
  ('A1', 'My Family', 'Ailem', 'Describe your family members', 'Aile üyelerinizi tanıtma', '["mother", "father", "sister", "brother", "years old"]'),
  ('A1', 'My Hobbies', 'Hobilerim', 'Talk about what you like to do', 'Boş zaman aktiviteleriniz hakkında konuşma', '["reading", "music", "sports", "weekend", "favorite"]')
) as v(level, title, title_tr, description, description_tr, topics)
join public.curriculum_modules m on m.category_code = v.level and m.name_tr = 'Başlangıç'
where not exists (
  select 1 from public.scenarios s where s.title = v.title and s.level = v.level
);

-- === Yeni pratik konular (A1 Gelişmiş) ===
insert into public.scenarios (level, title, title_tr, description, description_tr, topics, is_active, module_id)
select v.level, v.title, v.title_tr, v.description, v.description_tr, v.topics::jsonb, true, m.id
from (values
  ('A1', 'Phone Call', 'Telefonda Konuşma', 'Make a simple phone call', 'Basit telefon görüşmesi yapma', '["hello", "speaking", "message", "call back", "number"]'),
  ('A1', 'At the Doctor', 'Doktorda', 'Describe simple health problems', 'Basit sağlık şikayetlerini anlatma', '["headache", "fever", "medicine", "appointment", "feel"]')
) as v(level, title, title_tr, description, description_tr, topics)
join public.curriculum_modules m on m.category_code = v.level and m.name_tr = 'Gelişmiş'
where not exists (
  select 1 from public.scenarios s where s.title = v.title and s.level = v.level
);

-- === Ornek cumleler (yeni konular icin) ===
insert into public.sentences (turkish, english, level, topic)
select v.tr, v.en, v.lvl, v.topic from (values
  ('Bir kahve alabilir miyim?', 'Can I have a coffee, please?', 'A1', 'Kafede Sipariş'),
  ('Hesap lütfen.', 'The bill, please.', 'A1', 'Kafede Sipariş'),
  ('Çay istiyorum.', 'I would like some tea.', 'A1', 'Kafede Sipariş'),
  ('Sütlü kahve var mı?', 'Do you have coffee with milk?', 'A1', 'Kafede Sipariş'),
  ('Tren istasyonu nerede?', 'Where is the train station?', 'A1', 'Yol Tarifi'),
  ('Düz gidin, sonra sola dönün.', 'Go straight, then turn left.', 'A1', 'Yol Tarifi'),
  ('Banka yakın mı?', 'Is the bank nearby?', 'A1', 'Yol Tarifi'),
  ('Bugün hava çok güzel.', 'The weather is very nice today.', 'A1', 'Hava Durumu'),
  ('Yağmur yağıyor.', 'It is raining.', 'A1', 'Hava Durumu'),
  ('Hava çok soğuk.', 'The weather is very cold.', 'A1', 'Hava Durumu'),
  ('İki kardeşim var.', 'I have two siblings.', 'A1', 'Ailem'),
  ('Annem öğretmen.', 'My mother is a teacher.', 'A1', 'Ailem'),
  ('Babam doktor.', 'My father is a doctor.', 'A1', 'Ailem'),
  ('Kitap okumayı severim.', 'I like reading books.', 'A1', 'Hobilerim'),
  ('Hafta sonu yüzmeye gidiyorum.', 'I go swimming on weekends.', 'A1', 'Hobilerim'),
  ('Müzik dinlemeyi severim.', 'I like listening to music.', 'A1', 'Hobilerim'),
  ('Benimle konuşuyor musunuz?', 'Are you speaking to me?', 'A1', 'Telefonda Konuşma'),
  ('Sizi sonra arayacağım.', 'I will call you back later.', 'A1', 'Telefonda Konuşma'),
  ('Mesaj bırakabilir miyim?', 'Can I leave a message?', 'A1', 'Telefonda Konuşma'),
  ('Numaranız nedir?', 'What is your number?', 'A1', 'Telefonda Konuşma'),
  ('Alo, Ahmet orada mı?', 'Hello, is Ahmet there?', 'A1', 'Telefonda Konuşma'),
  ('Başım ağrıyor.', 'I have a headache.', 'A1', 'Doktorda'),
  ('Randevu almak istiyorum.', 'I would like to make an appointment.', 'A1', 'Doktorda'),
  ('Ateşim var.', 'I have a fever.', 'A1', 'Doktorda'),
  ('Kendimi iyi hissetmiyorum.', 'I do not feel well.', 'A1', 'Doktorda'),
  ('İlaç almam gerekiyor.', 'I need to take medicine.', 'A1', 'Doktorda'),
  ('Boğazım ağrıyor.', 'I have a sore throat.', 'A1', 'Doktorda'),
  ('Her sabah kahvaltı yaparım.', 'I have breakfast every morning.', 'A1', 'Günlük Rutin'),
  ('İşe saat dokuzda giderim.', 'I go to work at nine.', 'A1', 'Günlük Rutin'),
  ('Adım Ayşe.', 'My name is Ayşe.', 'A1', 'Selamlaşma ve Tanışma'),
  ('Tanıştığımıza memnun oldum.', 'Nice to meet you.', 'A1', 'Selamlaşma ve Tanışma')
) as v(tr, en, lvl, topic)
where not exists (
  select 1 from public.sentences s where s.english = v.en
);

notify pgrst, 'reload schema';

select m.name_tr as modul, count(s.id) as konu_sayisi
from public.curriculum_modules m
left join public.scenarios s on s.module_id = m.id and s.is_active = true
where m.category_code in ('A1', 'A2')
group by m.category_code, m.name_tr, m.sort_order
order by m.category_code, m.sort_order;
