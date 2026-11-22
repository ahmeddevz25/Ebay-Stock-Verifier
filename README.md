# 🚀 Stockline — eBay Stock & Inventory Verifier (Bulk 10,000+ Links)

Modern, eye-catching Web UI aur High-Performance Engine jo Excel sheet me mojood hazaron eBay product links ko verify karke unka live stock status (`IN STOCK`, `OUT OF STOCK`, `SOLD OUT / ENDED`, `INVALID`) original Excel sheet me update karta hy.

---

## ✨ Features (Khasusiyat)

1. **Eye-Catching Modern UI:**
   * Naya light "ledger / manifest" design (Stockline): cream paper, bold typography, left-rail steps, big progress numeral aur colour-coded status distribution bar.
   * Real-time animated progress bar aur speed indicator (~150 items/sec).
   * 4 KPI tiles:
     * 🟢 **Available / In Stock** (Quantity ke sath)
     * 🟡 **Out of Stock** (Active listing, Qty = 0)
     * 🔴 **Sold Out / Ended** (Closed listing)
     * ⚪ **Invalid / Removed** (Link expire / deleted)
2. **Bulk 10,000+ Links Support:**
   * 1-by-1 check karne ki bajaye **20 links ka batch** request bhejta hy (eBay Browse API standard).
   * 10,000 links sirf ~45 to 60 seconds me verify ho jate hain.
3. **Smart Column Auto-Detection:**
   * File upload karne par automatically eBay links ka column pehchan leta hy. Agar chaho to manually bhi dropdown se select kar sakte ho.
4. **Instant Test / Demo Mode:**
   * UI me **"Load 10k Demo Links"** ka button hy, jis se bina kisi file upload kiye ya bina API keys ke aap 1-click me 10,000 links ka live demo run kar ke dekh sakte hain.
5. **Live Search & Filter Tabs:**
   * Results ko `All`, `In Stock`, `Out of Stock`, `Sold Out`, `Invalid` me filter karein ya Item ID / Title se live search karein.
6. **One-Click Excel (.xlsx) Export:**
   * SheetJS engine ke zarye verify hone ke baad modified Excel sheet generate hoti hy jisme original data ke sath:
     * `eBay Item ID`
     * `Stock Status`
     * `Available Qty`
     * `Price`
     * `Verified Date`
     shamil hote hain.

---

## 🛠️ Kaise Run Karein? (How to Run)

Kisi heavy installation ya package download ki zaroorat nahi hy. Node.js ke built-in server se foran chal jata hy:

1. Terminal / Command Prompt open karein aur project folder me jayen:
   ```bash
   cd d:\ebay-stock-verifier
   ```

2. Server start karein:
   ```bash
   node server.js
   ```

3. Apne browser me yeh link kholein:
   ```
   http://localhost:3000
   ```

---

## 🔑 eBay API Credentials (Optional)

Agar aap live real eBay API use karna chahte hain:
1. Top-right me **"eBay API Keys"** button dabayein.
2. Mode ko **"Live eBay API"** par switch karein.
3. Apna eBay Developer **Client ID** aur **Client Secret** enter kar ke **Save** kar lein.
