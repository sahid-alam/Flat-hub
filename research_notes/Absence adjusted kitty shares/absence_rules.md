# Absence-adjusted kitty shares

Question: when a flatmate is away, how much of the common grocery spend should they carry? Bills are out of scope.
Researched 2026-10-02. **[Inference]** marks my own reasoning. Everything else is tied to a link, with the caveats in §1.

## 1. How real setups do it

**Coverage gaps.** Reddit blocks this crawler, so I read no r/india, r/bangalore, r/bangladesh or r/roommates threads. PG searches turned up only rent, deposit and GST terms, with nothing on deducting food charges for leave days. Flatastic's site doesn't document weighted splits or an away mode. The "Mess Manager: Meal Tracker" Play Store page wouldn't load.

**Bangladeshi/South Asian bachelor messes** charge by meal count. The meal rate is total bazar ÷ total meals, and each member pays meals × rate ([Mess Mate](https://messmate.bd/en)). One calculator site describes the usual practice: you tell the manager before **10 AM** to stop that day's meal, an absent member pays no meal cost but **still pays fixed costs (seat rent, WiFi, bua, gas) in full**, and a guest's meals go on the host's count ([meal-rate calculator](https://studentmealcalculator.convertertoolsai.com/)). [MessBuddy](https://messbuddy.org/) has members "tap in their meals before the daily cutoff", lets them "skip a whole day with a switch", and offers fixed, weighted or market meal rates.

**Indian hostel messes** give a "rebate" only above a threshold of consecutive days, and usually only with advance notice:

| Hostel | Min. consecutive days | Notice |
|---|---|---|
| [IISc](https://hostel.iisc.ac.in/hostel/index.php/home/messrules/defAction/messrules) | 2 | 1 day ahead |
| [IIT Madras](https://ccw.iitm.ac.in/pages/mess-rebate-rules) | 4 | 3 days ahead, online only, no retroactive claims; documents needed beyond 15 days |
| [IIT Hyderabad](https://www.iith.ac.in/academics/assets/files/forms/hostel/Mess_Rebate_Form_05_10_2021.pdf) | 5 | 48 h |
| [IIIT Lucknow](https://iiitl.ac.in/wp-content/uploads/2021/07/Mess-Guidelines-Rebate_form.pdf) | 5 | 3 days ahead, and "no mess rebate… if advance intimation is not provided". Medical emergencies can apply within 3 days of leaving. No staying in the hostel during the rebate period. |
| [DU (Ramjas)](https://ramjas.du.ac.in/college/web/index.php?r=hostel/mess-procedures) | 5 | n/a |
| [IIITDM](https://old.iiitdm.ac.in/docs/hostel/HOSTEL_MESS_REBATE_FORM.pdf) | 11 | n/a |

IIT Madras and IIIT Lucknow rules were read directly. The other rows come from search summaries citing those pages, so re-check them before quoting. Hostels probably insist on notice because the caterer cooks for a headcount in advance **[inference]**.

**Flat-shares.** The [FairSplit guide](https://usefairsplit.com/guides/splitting-costs-frequent-traveler/) treats groceries and consumables as variable costs. It suspends a traveller's grocery contribution during an absence with no threshold, but prorates utilities only for absences of 14+ consecutive days. Rent and internet are never discounted. Its sample agreement requires written notice of travel dates before departure.

**Apps.** In a [Splitwise feedback thread](https://feedback.splitwise.com/forums/162446-general/suggestions/3296738-spliting-expense-per-day-basis), a user asked for per-day splitting. Staff answered that they had added split-by-shares so you can "split your utilities by shares for each day you are in the apartment", which means you type in days-present yourself. [Spliit](https://spliit.app/) also splits by shares. Its [`shares.ts`](https://github.com/spliit-app/spliit/blob/HEAD/src/lib/shares.ts) uses largest-remainder apportionment in minor units and breaks ties by an FNV hash of the expense id (see `../Flatmate household management app/verification_and_hands_on.md`). Neither app tracks presence. Only the mess apps (meal counts) do. [Flatastic](https://play.google.com/store/apps/details?id=com.flatastic.app&hl=en) splits among the flatmates an item was bought for, with no documented weighting.

## 2. Options and trade-offs

- **Pro-rata by days present.** This is simple and easy to explain, and it is the flat-share version of a meal count. On its own, though, it means logging every overnight trip. Weekend trips become petty book-keeping, and a 1-day absence moves the shares by only about ₹50.
- **Absence counts only from a threshold up (e.g. ≥3 consecutive days).** Every hostel above uses some threshold. It removes the noise from short trips. It does create a cliff: a 2-day trip saves nothing and a 3-day trip saves 3 days. The gaming risk (stretching a trip by one day) costs about ₹60 per extra day, so it is negligible **[inference]**.
- **Fixed + variable portions.** Messes keep a fixed portion because rent, WiFi and the cook still have to be paid. Here the matching costs are the bills, which are already split separately, so the kitty is purely consumables. The threshold already covers the staples (oil, spices) that are used up regardless of who is home. A separate staples portion would need line-level tagging and a tunable percentage for little gain **[inference]**.
- **Advance notice vs retroactive marking.** Hostels require notice because they cook to a headcount. A flat orders from Zepto on demand, so notice doesn't save any money. The real risk is false claims made after the fact. With 6 friends who all know who was home, making late entries visible works better than requiring approval **[inference]**.
- **Per-spend vs per-month weighting.** Weighting each spend by who was present on its date looks precise, but it ties shares to *when things were ordered*. A big stock-up the day after someone leaves costs them nothing, even though they eat it when they return. That invites people to time orders around departures and gets stock purchases wrong. Weighting by days present over the whole month averages out purchase timing and needs one allocation per month **[inference]**.
- **Effect on the ₹2,000 top-up.** One approach lowers the planned top-up in advance for a known trip, but that relies on forecasting and trips change. The other credits the absent mate after the fact: their lower share leaves them a positive position, and the next top-up is reduced by that amount. The second uses only days actually logged **[inference]**.

## 3. Recommended rule

> **Each calendar month's grocery spend is split by days present in that month. An absence counts only if it is a run of 3 or more consecutive days. Absences can be logged until the month closes, and late entries are flagged. A credit reduces the next top-up.**

The formula uses the existing columns (`member.joined_on/left_on`, `member_absence.from_date/to_date`, inclusive dates):

```
for each member m, for month M:
  runs        = union of m's member_absence ranges (merge overlapping/adjacent)
  qualifying  = runs with total length ≥ 3 days        # judged on the whole run, even if it spans months
  absent(m)   = count of dates in M covered by qualifying runs
  member(m)   = count of dates d in M with joined_on ≤ d ≤ coalesce(left_on, ∞)
  w(m)        = member(m) − absent(m)
if Σw = 0 and spend_M > 0:  w(m) = member(m)          # nobody present: fall back to membership days
share_M = allocate(Σ spend.total_paise in M, w)      # largest remainder, ties by member id ascending
share(m) = Σ over months share_M(m)
```

Invariant 2 (Σ share = Σ spend) still holds because each month's allocation sums exactly. The current month's shares are **provisional** until it closes, since absences can still be added. After close, that month's absence records are frozen. A spend reversal is allocated in its target spend's month, using that month's weights, so it nets to zero for every member (invariant 4) **[inference]**.

**Worked example.** There are 6 mates, A to F, sorted by id. Total spend is ₹11,400 = 1,140,000 paise in a 30-day month. A was away 10 consecutive days, which qualifies, so w = 20. B was away 2 days, which is under the threshold, so w = 30. C to F have w = 30. Σw = 170.

| Mate | w | 1,140,000·w ÷ 170 | floor | remainder | +1? | share (paise) | equal split |
|---|---|---|---|---|---|---|---|
| A | 20 | 134,117.65 | 134,117 | 110/170 | yes (largest) | **134,118** | 190,000 |
| B | 30 | 201,176.47 | 201,176 | 80/170 | yes (tie, lowest id) | **201,177** | 190,000 |
| C | 30 | 201,176.47 | 201,176 | 80/170 | yes (tie) | **201,177** | 190,000 |
| D–F | 30 | 201,176.47 | 201,176 | 80/170 | no | **201,176** each | 190,000 |

The floors sum to 1,139,997, which leaves 3 paise. They go to A (remainder 110), then to B and C, which win the five-way tie at 80 by id. Check: 134,118 + 2×201,177 + 3×201,176 = **1,140,000** ✓. A pays ₹1,341.18 instead of ₹1,900. Everyone else pays ₹2,011.76 or ₹2,011.77.

**Top-up.** Everyone contributed 200,000. Positions (credit − share) are A **+65,882**, B and C −1,177, D to F −1,176. They sum to 60,000, which equals pool cash (1,200,000 − 1,140,000) ✓. Suggested next top-up = `monthly_topup_paise − position`: A pays **₹1,341.18**, B and C ₹2,011.77, D to F ₹2,011.76. The pool returns to ₹12,000 and every position resets to +₹2,000. Top-ups are never reduced in advance for a planned trip, only by logged days.
*Implementer decision:* this makes the UPI amount dynamic, while the M1 prompt shows a fixed ₹2,000 card. The other option is to keep ₹2,000 fixed and let the credit build up as a positive position. That is simpler, but the absent mate's money stays tied up in the pool.

**Notice [inference].** An absence can be logged any time until month close. On the month statement, records with `created_at > from_date` are shown as "added late", so the flat can query them. Nobody needs to approve them.

## 4. Edge cases

- **Joining or leaving mid-month.** Days outside `joined_on…left_on` are not absence. They just aren't counted, so the 3-day threshold never applies to them. When a mate leaves, their position is settled in cash from the pool. Pantry stock is neither refunded to the leaver nor charged to the person joining **[inference]**.
- **Overlapping absences across members.** Each member's weight is worked out independently. If three are away at once, the spend is shared among whoever was home, and fewer people usually means less spend, which is the intended behaviour.
- **Overlapping or adjacent records for one member.** Merge them first, then test the threshold. Two back-to-back 2-day entries count as one 4-day trip.
- **Absent all month.** w = 0, so share = 0, and that month's contribution carries over as credit. If everyone is away and there is still spend, the fallback splits it by membership days.
- **Guest staying.** There is no table for guests yet, so this is deferred (YAGNI). If it's needed, mirror the absence rule: the host's weight goes up by the guest's days for stays of 3 or more days, the same way messes add guest meals to the host's count ([calculator](https://studentmealcalculator.convertertoolsai.com/)) **[inference]**.
