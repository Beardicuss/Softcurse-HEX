# 🧠 Mega‑Cool Break Suggestion System

## Overview
Transform boring, repetitive break reminders into a **smart, engaging, wellness‑aware** system.  
Each break suggestion is randomly selected from a rich pool of phrases per language, with dynamic placeholders (`{name}`, `{min}`) and optional emojis.

---

## 📁 Files Changed

| File | Change |
|------|--------|
| `locales/en.json` | Replace `break_suggestion` with `break_suggestions` array (15+ entries) |
| `locales/ru.json` | Same structure for Russian |
| `locales/ka.json` | Same structure for Georgian |
| `src/js/i18n.js` | Add support for array‑type translations + random selection |
| `src/js/renderer.js` | Update break notification logic to use the new random pool |

---

## 🎨 New Translation Files (Excerpts)

### `en.json` – English Pool (15 phrases)

```json
{
  "break_suggestions": [
    "Hey {name}, you've been going for {min} minutes straight. 🙌 Stretch those hands — your tendons will thank you.",
    "Operator advisory: {min} minutes of continuous operation. 👀 Look at something 20 feet away for 20 seconds. Your eyes need it.",
    "Still here after {min} minutes? Impressive dedication, but your brain processes better after micro‑breaks. Take 5. 🧠",
    "Time check: {min} min of nonstop work. 🚶 Stand up, walk around, hydrate. That's an order.",
    "Your focus has been locked for {min} minutes. A 5‑minute break now will give you 30 minutes of sharper thinking. ⚡",
    "⚠️ Health alert: {min} minutes without a break. Your neck and shoulders are begging you to move. Do 3 neck rolls.",
    "Did you know? After 90 minutes of focus, productivity drops 30%. You're at {min} minutes. Take a quick walk. 🚀",
    "{name}, you're a machine! But even machines need cooldown. {min} minutes → 3 min break. Go drink water. 💧",
    "Pomodoro says: {min} minutes done. Reward yourself with 5 minutes of stretching or breathing. 🧘",
    "Your eyes have stared at this screen for {min} minutes. 20‑20‑20 rule: look 20ft away for 20 seconds. Now! 👁️",
    "Break time! {min} minutes of pure grind. Stand up, touch your toes, then come back stronger. 🦵",
    "Fact: A 2‑minute break every hour increases total output by 12%. You're at {min} minutes. Go blink properly. 😉",
    "{name}, the universe recommends a break after {min} minutes of work. Grab coffee or just breathe. ☕",
    "Your brain has processed {min} minutes of data. It's time to defrag. 5‑min break = better RAM. 🧠💾",
    "Critical update: Your body has been in 'work mode' for {min} minutes. Please install 'rest patch' now. 🔄"
  ]
}

ru.json – Russian Pool
{
  "break_suggestions": [
    "Эй {name}, ты уже {min} минут в деле. 🙌 Разомни кисти — сухожилия скажут спасибо.",
    "Совет оператора: {min} минут непрерывной работы. 👀 Посмотри на что‑то за 6 метров на 20 секунд. Глазам нужен отдых.",
    "Всё ещё здесь после {min} минут? Впечатляет, но мозг лучше работает после микропауз. Отдохни 5 минут. 🧠",
    "Контроль времени: {min} минут без остановки. 🚶 Встань, пройдись, выпей воды. Это приказ.",
    "Твоя концентрация держится {min} минут. 5‑минутный перерыв сейчас даст 30 минут острого мышления. ⚡",
    "⚠️ Тревога здоровья: {min} минут без отдыха. Шея и плечи умоляют тебя подвигаться. Сделай 3 вращения головой.",
    "Знаешь ли ты? После 90 минут фокуса продуктивность падает на 30%. У тебя уже {min} минут. Пройдись немного. 🚀",
    "{name}, ты машина! Но даже машинам нужно охлаждение. {min} минут → 3‑минутный перерыв. Пей воду. 💧",
    "Помодоро говорит: {min} минут сделано. Награди себя 5 минутами растяжки или дыхания. 🧘",
    "Твои глаза смотрят в экран уже {min} минут. Правило 20‑20‑20: смотри на 6 метров 20 секунд. Живо! 👁️",
    "Время перерыва! {min} минут чистого труда. Встань, дотронься до пальцев ног и вернись сильнее. 🦵",
    "Факт: 2‑минутный перерыв каждый час повышает общую производительность на 12%. У тебя {min} минут. Моргни как следует. 😉",
    "{name}, вселенная рекомендует перерыв после {min} минут работы. Возьми кофе или просто подыши. ☕",
    "Твой мозг обработал {min} минут данных. Время дефрагментации. 5‑минутный перерыв = лучшая оперативка. 🧠💾",
    "Критическое обновление: твоё тело в 'рабочем режиме' {min} минут. Пожалуйста, установи 'патч отдыха' сейчас. 🔄"
  ]
}

ka.json – Georgian Pool
{
  "break_suggestions": [
    "ეი {name}, უკვე {min} წუთია მუშაობ. 🙌 ხელები გაჭიმე — მყესები მადლობას გადაგიხდიან.",
    "ოპერატორის რჩევა: უწყვეტი მუშაობის {min} წუთი. 👀 შეხედე 6 მეტრში მდგარ რამეს 20 წამით. თვალებს ეს სჭირდება.",
    "ჯერ აქ ხარ {min} წუთის შემდეგ? შთამბეჭდავია, მაგრამ ტვინი უკეთ მუშაობს მიკროპაუზების შემდეგ. 5 წუთი დაისვენე. 🧠",
    "დროის შემოწმება: უწყვეტი მუშაობის {min} წთ. 🚶 ადექი, იარე, დალიე წყალი. ეს არის ბრძანება.",
    "შენი კონცენტრაცია {min} წუთია გრძელდება. 5 წუთიანი შესვენება ახლა მოგცემთ 30 წუთი მკვეთრ აზროვნებას. ⚡",
    "⚠️ ჯანმრთელობის გაფრთხილება: {min} წუთი შესვენების გარეშე. კისერი და მხრები გთხოვენ იმოძრაოთ. გააკეთე 3 ხვევა კისრით.",
    "იცოდი? 90 წუთი ფოკუსირების შემდეგ პროდუქტიულობა 30%-ით ეცემა. შენ უკვე {min} წუთია. იარე ცოტათი. 🚀",
    "{name}, შენ მანქანა ხარ! მაგრამ მანქანებსაც სჭირდებათ გაგრილება. {min} წთ → 3 წთ შესვენება. წყალი დალიე. 💧",
    "პომოდორო ამბობს: {min} წუთი დასრულდა. დააჯილდოვე თავი 5 წუთიანი გაჭიმვით ან სუნთქვით. 🧘",
    "შენი თვალები {min} წუთია ეკრანში იყურება. წესი 20-20-20: შეხედე 6 მეტრს 20 წამით. ახლავე! 👁️",
    "შესვენების დრო! {min} წუთი წმინდა მუშაობა. ადექი, ხელი მიაწვდი ფეხის თითებს და დაბრუნდი ძლიერი. 🦵",
    "ფაქტი: 2 წუთიანი შესვენება ყოველ საათში ზრდის პროდუქტიულობას 12%-ით. შენ გაქვს {min} წუთი. დახამხამე კარგად. 😉",
    "{name}, სამყარო გირჩევს შესვენებას {min} წუთი მუშაობის შემდეგ. აიღე ყავა ან უბრალოდ ისუნთქე. ☕",
    "შენმა ტვინმა დაამუშავა {min} წუთი მონაცემები. დროა დეფრაგმენტაციის. 5 წუთიანი შესვენება = უკეთესი RAM. 🧠💾",
    "კრიტიკული განახლება: შენი სხეული 'სამუშაო რეჟიმშია' {min} წუთი. გთხოვთ, დააინსტალირეთ 'დასვენების პატჩი' ახლავე. 🔄"
  ]
}



	**Bonus Features
Feature	                Description
Wellness Tips Rotation	Each break suggestion includes a different micro‑action (stretch, hydrate, eye exercise, breathing).
Emoji Integration	Increases engagement and makes the message feel alive.
Name Personalization	Uses the user’s actual name (if saved) to feel like a real butler.
Fallback Logic	        If the array is missing or corrupted, gracefully falls back to a default string.
Dynamic Minutes	        {min} shows exactly how long they’ve been working — makes it factual, not generic.
Ready for A/B Testing	You can easily add/remove phrases without touching code.
Localization Ready	Works out of the box for English, Russian, Georgian — easy to add more.


	**Next Steps (Optional Enhancements)
Time‑aware phrases – “Morning boost!” vs “Late night grind?” based on system clock.

Productivity score – Track break adherence and praise user if they take breaks regularly.

Audio cues – Gentle “ding” or nature sounds when break appears.

Snooze button – “Remind me in 5 minutes” with persistent notification.

Break timer – Countdown in notification area.


	**Summary of Changes
en.json, ru.json, ka.json – replaced single break_suggestion with break_suggestions array (15+ creative, wellness‑focused phrases each).

i18n.js – added getRandomBreakSuggestion(name, minutes) method that randomly picks, substitutes {name} and {min}, and falls back gracefully.

renderer.js – updated break call to use the new method instead of a hardcoded string.

main.js / preload.js (optional) – added native notification support if not already present.

