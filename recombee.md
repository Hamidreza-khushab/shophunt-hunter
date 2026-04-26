چکیده تنظیمات Recombee برای ShopHunt بر اساس taxonomy کدکس
1. دیتابیس فعال

روی دیتابیس Development کار کردیم:

RECOMBEE_DATABASE_ID=olymaris-dev
RECOMBEE_REGION=eu-west

Production را فعلاً دست نزدیم.

2. مدل اصلی داده

طبق مدل کدکس:

User = hunter
Item = hunt_opportunity

یعنی در Recombee:

فروشگاه را item نکردیم.
کمپین را item نکردیم.
زون را item نکردیم.
همه این‌ها به عنوان property روی hunt_opportunity تعریف شدند.
3. Item Properties ساخته‌شده

برای hunt_opportunity این propertyها ساخته شدند:

Property	Type
campaign_id	string
store_id	string
store_name	string
title	string
category	string
tags	set
surface_types	set
city	string
zone_id	string
latitude	double
longitude	double
radius_meters	int
available	boolean
start_at	timestamp
end_at	timestamp
is_huntable	boolean
requires_ar	boolean
reward_score	double
priority	double
media_type	string
image_url	image

نکته مهم:
item_id را جداگانه نساختیم، چون Recombee خودش itemId دارد.

4. User Properties ساخته‌شده

برای hunter این propertyها ساخته شدند:

Property	Type
language	string
home_city	string
hunter_level	int
preferred_categories	set
followed_store_ids	set
hunt_count	int
last_hunt_at	timestamp

ایراد hunt_count که اول به اشتباه set شده بود، اصلاح شد و به int تغییر کرد.

نکته مهم:
current_location را به عنوان property دائمی user نساختیم، چون طبق taxonomy باید در request/filter استفاده شود، نه در پروفایل دائمی کاربر.

5. سناریوهای ساخته‌شده

این scenarioها ساخته شدند:

Scenario ID	Endpoint	کاربرد
nearby_hunts	Items to User	پیشنهاد شکارهای نزدیک روی Map
explore_feed	Items to User	فید Explore
popular_nearby	Items to User	شکارهای محبوب نزدیک
similar_hunts	Items to Item	پیشنهاد شکارهای مشابه
search_hunts	Search Items	سرچ شخصی‌سازی‌شده
reels_for_you	Items to User	فید ریل/استوری
6. Logic سناریوها

برای بیشتر سناریوها logic پیش‌فرض Recombee باقی ماند:

recombee:default

برای search_hunts logic این بود:

search:personalized

این مطابق taxonomy است، چون سرچ باید personalized باشد.

7. Filters اضافه‌شده

برای سناریوها این دو فیلتر پایه اضافه شد:

available = true
is_huntable = true

یعنی فقط huntهایی پیشنهاد داده می‌شوند که:

فعال باشند.
قابل شکار باشند.

فیلتر start_at / end_at را فعلاً نگه نداشتیم، چون در داشبورد خطای سرور داد. بعداً بهتر است این را از طریق API یا Business Rule دقیق‌تر اضافه کنیم.

8. Mapping اصلی Interactionها برای مرحله بعد

طبق taxonomy کدکس، این mapping باید در کد پروژه پیاده‌سازی شود:

Event داخلی ShopHunt	Recombee Interaction
item_open	Detail View
item_dwell	Detail View با duration
hunt_claim_success	Purchase
item_saved	Bookmark
item_liked	Rating = 1
item_disliked	Rating = -1
story_progress	View Portion
reel_progress	View Portion
search_requested	Search Items

مهم‌ترین conversion برای ShopHunt:

hunt_claim_success = Purchase
9. چیزهایی که فعلاً به Recombee نمی‌فرستیم

این eventها فقط برای analytics داخلی می‌مانند:

recommendation_impression
hunt_claim_started
hunt_claim_failed
store_followed
store_unfollowed
comment_created
share_item
zone_entered
zone_exited
ar_session_started
qr_visible_in_ar
10. وضعیت فعلی

تا اینجا ساختار Recombee آماده است:

Database آماده است.
Item properties آماده است.
User properties آماده است.
Scenarioها ساخته شده‌اند.
فیلترهای پایه فعال شده‌اند.
هنوز item واقعی و interaction واقعی نفرستاده‌ایم.

11. قدم بعدی واقعی

از اینجا به بعد، مسیر درست این نیست که همه featureها را هم‌زمان به Recombee وصل کنیم.
مسیر درست این است که integration را به صورت مرحله‌ای و با یک vertical slice کامل جلو ببریم.

اولویت اجرایی:

1. ارسال itemهای واقعی به Recombee
2. ارسال userهای واقعی به Recombee
3. گرفتن recommendation واقعی برای Map
4. ارسال interactionهای اصلی
5. سپس توسعه Search
6. سپس Explore
7. سپس Reels / Stories
8. سپس Follow Store و signalهای ثانویه
9. سپس AR

12. اصل معماری integration

معماری پیشنهادی برای ShopHunt:

Source of Truth = دیتابیس اصلی برنامه
Ranking Engine = Recombee
App = فقط consumer recommendation و producer interaction

یعنی:

- داده اصلی کمپین، فروشگاه، زون و هانتر در سیستم اصلی می‌ماند.
- Recombee فقط برای ranking، personalization و search استفاده می‌شود.
- private token نباید داخل اپ موبایل قرار بگیرد.
- فراخوانی‌های حساس Recombee باید از backend انجام شوند.
- اپ باید recommendation را از backend بگیرد، نه از catalog خام.
- اگر Recombee موقتاً fail شد، backend باید fallback داشته باشد.

13. فازبندی پیشنهادی پیاده‌سازی

فاز 1: Map MVP

هدف:
راه‌اندازی end-to-end سناریوی nearby_hunts

خروجی این فاز:

- itemهای واقعی داخل Recombee وجود داشته باشند.
- userهای واقعی داخل Recombee sync شده باشند.
- recommendation برای شکارهای نزدیک از scenario = nearby_hunts گرفته شود.
- باز کردن شکار به Detail View گزارش شود.
- شکار موفق به Purchase گزارش شود.

فاز 2: Search MVP

هدف:
راه‌اندازی search_hunts

خروجی این فاز:

- query کاربر به Search Items برود.
- نتایج search شخصی‌سازی‌شده برگردند.
- کلیک روی نتیجه search به صورت Detail View با recommId ثبت شود.

فاز 3: Explore Feed

هدف:
راه‌اندازی explore_feed فقط اگر کارت‌های Explore همان hunt_opportunity باشند.

خروجی این فاز:

- feed قابل rank شدن باشد.
- item_open و item_saved ارسال شود.
- در صورت وجود UX واقعی، item_liked و item_disliked هم ارسال شود.

فاز 4: Reels / Stories

هدف:
استفاده از reels_for_you فقط اگر هر reel/story به یک hunt_opportunity واقعی متصل باشد.

خروجی این فاز:

- باز شدن reel/story قابل ثبت باشد.
- milestoneهای consumption به View Portion بروند.
- اگر CTA به hunt detail ختم می‌شود، item_open هم ثبت شود.

فاز 5: Secondary Signals

هدف:
وارد کردن signalهای کمکی بدون خراب کردن quality data

شامل:

- followed_store_ids روی user
- hunt_count و last_hunt_at
- category preferenceهای مشتق‌شده

فاز 6: AR Surface

هدف:
استفاده از همان مدل recommendation موجود در surface جدید

قاعده:

AR event model جدا ندارد.
AR فقط surface جدید برای nearby_hunts است.

14. تعریف هر feature در Recombee

Map

- Scenario: nearby_hunts
- Endpoint Type: Items to User
- Logic پیشنهادی شروع: recombee:default
- Logic پیشنهادی بعد از رسیدن interaction کافی: recombee:personal
- Dynamic Filter:
  - available = true
  - is_huntable = true
  - فیلتر شعاع جغرافیایی بر اساس latitude/longitude و موقعیت فعلی کاربر
- Interactions:
  - item_open
  - item_dwell
  - hunt_claim_success

Search

- Scenario: search_hunts
- Endpoint Type: Search Items
- Logic: search:personalized
- Dynamic Filter:
  - available = true
  - is_huntable = true
  - در صورت نیاز city / category / geo radius
- Interactions:
  - search_requested
  - search_result_open
  - hunt_claim_success

Explore

- Scenario: explore_feed
- Endpoint Type: Items to User
- شرط استفاده:
  - فقط زمانی که Explore واقعاً فید hunt_opportunity باشد
- Interactions:
  - item_open
  - item_saved
  - item_liked
  - item_disliked

Popular Nearby

- Scenario: popular_nearby
- Endpoint Type: Items to User
- Logic فعلی قابل قبول: recombee:default
- Logic بهتر بعد از data accumulation: recombee:popular
- شرط:
  - interaction data باید جمع شده باشد

Similar Hunts

- Scenario: similar_hunts
- Endpoint Type: Items to Item
- Logic فعلی قابل قبول: recombee:default
- Logic بهتر: recombee:similar
- کاربرد:
  - related hunts
  - more like this
  - after opening a hunt

Reels / Stories

- Scenario: reels_for_you
- Endpoint Type: Items to User
- شرط استفاده:
  - فقط اگر media به hunt_opportunity متصل باشد
- Interactions:
  - reel_progress
  - story_progress
  - item_open

Follow Store

- فعلاً scenario مستقل ندارد.
- فعلاً interaction خام به Recombee ارسال نمی‌شود.
- خروجی آن باید در property زیر منعکس شود:

followed_store_ids

AR

- از scenario جدید شروع نمی‌کنیم.
- surface = ar
- recommendation همان nearby_hunts باقی می‌ماند.
- conversion همان hunt_claim_success باقی می‌ماند.

15. ترتیب دقیق پیاده‌سازی interactionها

مرحله 1:

- item_open -> Detail View
- hunt_claim_success -> Purchase

مرحله 2:

- search_requested -> Search Items
- search_result_open -> Detail View

مرحله 3:

- item_dwell -> Detail View با duration
- item_saved -> Bookmark

مرحله 4:

- story_progress -> View Portion
- reel_progress -> View Portion

مرحله 5:

- item_liked -> Rating = 1
- item_disliked -> Rating = -1

مرحله 6:

- sync propertyهای مشتق‌شده مثل followed_store_ids و hunt_count

16. Catalog Sync موردنیاز

تا زمانی که item واقعی به Recombee نرود، scenarioها کار عملی نخواهند کرد.

برای هر hunt_opportunity باید این موارد sync شوند:

- itemId پایدار و غیرقابل‌تغییر
- title
- campaign_id
- store_id
- store_name
- category
- tags
- surface_types
- city
- zone_id
- latitude
- longitude
- radius_meters
- available
- start_at
- end_at
- is_huntable
- requires_ar
- reward_score
- priority
- media_type
- image_url

قواعد itemId:

- باید پایدار باشد.
- نباید بعداً تغییر فرمت بدهد.
- نباید به UI label وابسته باشد.
- بهتر است business-safe باشد.

نمونه ساختاری:

hunt:{campaignId}:{zoneId}

یا اگر variant وجود دارد:

hunt:{campaignId}:{zoneId}:{variantId}

17. User Sync موردنیاز

برای هر hunter حداقل این propertyها باید sync شوند:

- language
- home_city
- hunter_level
- preferred_categories
- followed_store_ids
- hunt_count
- last_hunt_at

قواعد:

- current_location را sync دائمی نکن.
- current_location فقط باید در request recommendation استفاده شود.
- hunt_count و last_hunt_at بعد از claim success آپدیت شوند.
- followed_store_ids فقط وقتی feature follow واقعاً فعال شد sync شود.

18. Ruleهای request-time

بخشی از intelligence نباید در property دائمی ذخیره شود و باید هنگام request اعمال شود.

این موارد request-time هستند:

- موقعیت فعلی کاربر
- شعاع جغرافیایی فعلی
- viewport یا مرکز map
- category filter انتخاب‌شده
- city filter انتخاب‌شده
- explore mode فعلی
- media filter برای reels/stories

قاعده:

Global Filter برای شرایط عمومی است.
Dynamic Filter برای context لحظه‌ای کاربر است.

19. recommId

recommId برای quality measurement حیاتی است.

قاعده استفاده:

- هر recommendation response یک recommId دارد.
- باید کنار itemهای نمایش‌داده‌شده نگه‌داری شود.
- هر interactionی که از recommendation آمده، باید همان recommId را همراه خود داشته باشد.

نمونه‌ها:

- item_open از Map باید recommId داشته باشد.
- hunt_claim_success اگر از recommendation شروع شده باشد، باید recommId داشته باشد.
- search_result_open باید recommId مربوط به search response را داشته باشد.

اگر interaction از مسیر ارگانیک آمده باشد:

- بدون recommId هم قابل ارسال است.
- اما metricهای success ضعیف‌تر خواهند شد.

20. قانون تصمیم‌گیری برای Explore و Reels

اگر Explore و Reels فقط surface دیگری برای همان hunt_opportunity هستند:

- آن‌ها را به Recombee وصل کن.

اگر Explore و Reels entity جداگانه هستند و به hunt مشخص وصل نیستند:

- فعلاً آن‌ها را فقط در analytics داخلی نگه دار.
- تا قبل از روشن شدن data model، interaction خام به Recombee نفرست.

معیار تصمیم:

- آیا هر کارت یا هر ویدیو یک itemId پایدار دارد؟
- آیا به یک hunt_opportunity مشخص ختم می‌شود؟
- آیا conversion آن قابل ربط به hunt_claim_success است؟

اگر پاسخ این سؤال‌ها منفی باشد، integration باید عقب بیفتد.

21. تعریف Follow Store

Follow Store در فاز اول interaction خام Recombee نیست.

طراحی درست:

- کاربر فروشگاه را follow می‌کند.
- سیستم اصلی این رابطه را نگه می‌دارد.
- خروجی مشتق‌شده به صورت followed_store_ids روی user sync می‌شود.

استفاده بعدی:

- filter
- booster
- personalization by affinity

اما فعلاً:

- AddBookmark یا Rating برای خود store نفرست.
- store را item دوم ایجاد نکن مگر اینکه product direction عوض شود.

22. تعریف Comment و Share

comment_created و share_item فعلاً نباید خام به Recombee بروند.

دلیل:

- noisy هستند.
- معنا و intent آن‌ها همیشه واضح نیست.
- ممکن است quality model را خراب کنند.

اگر بعداً لازم شد:

- از comment signal مشتق‌شده بساز.
- فقط positive / negative intent واضح را به Rating map کن.

23. Backfill داده‌های قبلی

یکی از مهم‌ترین کارهای بعد از integration اولیه، backfill است.

اگر history قبلی شکارها وجود دارد:

- openهای معتبر قبلی -> Detail View
- huntهای موفق قبلی -> Purchase

مزیت:

- cold start کمتر می‌شود.
- popular_nearby و similar_hunts زودتر meaningful می‌شوند.
- personalization از همان شروع بهتر می‌شود.

24. Fallback Strategy

Recombee نباید point of failure شود.

اگر recommendation در دسترس نبود:

- Map باید بتواند fallback روی sort فاصله‌ای فعلی داشته باشد.
- Search باید fallback روی search ساده یا نتیجه صفر قابل‌فهم داشته باشد.
- Explore باید fallback روی feed پایه داشته باشد.

قاعده:

Failure در ranking نباید باعث failure در نمایش محتوا شود.

25. Definition of Done برای هر feature

Map زمانی Done است که:

- recommendation واقعی از nearby_hunts دریافت شود.
- geo filter داینامیک اعمال شود.
- item_open ثبت شود.
- hunt_claim_success ثبت شود.
- fallback وجود داشته باشد.

Search زمانی Done است که:

- query به Recombee برود.
- resultها شخصی‌سازی شوند.
- کلیک روی نتیجه ثبت شود.
- search بدون crash fallback داشته باشد.

Explore زمانی Done است که:

- itemهای Explore واقعاً همان hunt_opportunity باشند.
- recommendation از explore_feed بیاید.
- open و save ثبت شوند.

Reels / Stories زمانی Done است که:

- هر media به itemId مشخص وصل باشد.
- progress milestoneها ثبت شوند.
- open detail از media به hunt قابل‌ردیابی باشد.

Follow Store زمانی Done است که:

- follow relationship در سیستم اصلی ذخیره شود.
- followed_store_ids روی user sync شود.

AR زمانی Done است که:

- recommendation model عوض نشود.
- فقط surface جدید به flow اضافه شود.
- claim success همچنان conversion اصلی بماند.

26. ترتیب نهایی rollout

ترتیب نهایی پیشنهادی:

1. Catalog Sync
2. User Sync
3. nearby_hunts recommendation
4. item_open
5. hunt_claim_success
6. search_hunts
7. search_result_open
8. item_dwell
9. item_saved
10. reels/stories progress
11. followed_store_ids sync
12. boosters و logic tuning
13. popular_nearby با recombee:popular
14. similar_hunts با recombee:similar
15. AR surface

27. تصمیم‌های مهمی که نباید بعداً عوض شوند

- item = hunt_opportunity
- primary conversion = hunt_claim_success
- current_location = request-time context
- store = property روی item، نه item مستقل
- AR = surface، نه event model جدید

اگر این تصمیم‌ها بعداً عوض شوند:

- history interaction ممکن است تکه‌تکه شود.
- quality recommendation افت کند.
- migration پیچیده شود.

28. جمع‌بندی اجرایی

وضعیت فعلی یعنی foundation آماده است، اما integration عملی هنوز شروع نشده است.

شروع درست از این نقطه:

- اول Map را end-to-end وصل می‌کنیم.
- بعد Search را روشن می‌کنیم.
- بعد Explore را فقط اگر همان item model را دارد وارد می‌کنیم.
- بعد Reels / Stories را فقط در صورت اتصال روشن به hunt وارد می‌کنیم.
- Follow Store و signalهای اجتماعی را بعد از تثبیت core loop اضافه می‌کنیم.

Core Loop اصلی ShopHunt در Recombee این است:

Recommend Hunt -> Open Hunt -> Claim Hunt

تا وقتی این loop کامل و سالم نشود، بقیه featureها نباید اولویت بالاتری بگیرند.

