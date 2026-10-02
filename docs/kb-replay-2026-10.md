# Ask UPPAbaby: knowledge base replay, October 2026

Run on 1 October 2026 against branch previews of kb/uppababy-knowledge-base, with the same Production keys (Anthropic, Supabase, Shopify). Replay requests are not written to assistant_logs.

## Standing questions (40)

Same 40 questions (`data/kb-seed/uppababy-standing-questions.json`) in file mode and db mode. 40 of 40 answered in both, no errors.

### Confirmed facts

| Question | File mode | DB mode |
|---|---|---|
| Fold Vista V3 with seat on | Yes, no mention of seat direction | Seat must face forward, second most upright recline |
| Fold Cruz V3 with seat on | Yes, no mention of seat direction | Seat must face forward, second most upright recline |
| Kona fold and seat direction | Not confirmed | Folds either way, only model that does |
| Minu V3 fabrics in the washing machine | Not confirmed | No, hand wash only |
| Cleaning Vista fabrics | Points to a guide | Hand wash, wipe-only harness, no machine wash |
| Mesa on Kona | Direct fit | Direct fit |
| Bassinet on Minu V3 | Not confirmed | Does not fit |
| Minu V3 weight limit | 22 kg (wrong) | 22.7 kg |
| Crash Exchange for a Vista | Mesa and base only | Mesa and base only |
| Vista toddler seat age | From about 6 months | From 6 months |
| RumbleSeat age | Not confirmed | From 6 months |
| BeSafe capsule on Vista / Cruz | Says it fits (wrong) | Not sold in Australia, gives the approved list |
| Floor display pram warranty | Three years (wrong) | 12 months from a retailer |
| Tune-Up Day eligibility | Any UPPAbaby pram | Any UPPAbaby pram |
| Mesa warranty | Three years (wrong) | Lifetime |
| Where designed and made | Not known | Massachusetts, made in China |
| From Birth Kit | Not known | Not sold in Australia |
| Vista V3 includes bassinet | Yes | Yes |

DB mode gives every confirmed fact correctly. File mode gets five wrong and leaves six unanswered.

### Everyday questions

Warranty, registration, serial number, boot fit, two children, lower capsule position, stockists, TravelSafe, spare parts, delivery, Vista from birth, Cruz car seats, Vista vs Cruz, Vista price, Minu newborn, warranty claim, squeaky wheel, flying, warranty parts and Crash Exchange: same facts, links and tone in both modes. DB mode adds detail from the help centre articles in a few places (no oil on wheels, delivery cost, approved capsule list). No answer lost a correct fact or a working link.

Two wordings come from entries David should confirm:

- Ex-display bought from UPPAbaby Australia carries the full three year warranty (fact:floor-display-warranty, article 9000188935).
- Tune-Up Days do not need the pram to be registered (fact:tune-up-days-anyone).

## Real customer questions (100)

The latest 100 unique first questions from assistant_logs (26 September to 1 October 2026), replayed in db mode and compared with the answer each customer actually received. The question file and results stay outside the repo.

| Result | Count |
|---|---|
| Same facts and links, similar tone | 70 |
| Better: a confirmed fact or help centre detail the live answer lacked or got wrong | 23 |
| Worse | 3 |
| Blank or cut off, in both modes | 4 |

Better, paraphrased: toddler seat and RumbleSeat from 6 months, Mesa lifetime warranty in the warranty summary, Mesa on Vista V2, bassinet not on Minu V3, the approved capsule list, returns within 30 days, the bassinet stand product, the warranty not transferring to a second owner.

Worse, paraphrased:

- Replacement RumbleSeat adapters: db mode said they are not the adapters that fit the RumbleSeat to the Vista. The live answer was right.
- Collecting an online order: db mode said orders can be collected from the Braeside showroom. The live answer said there is no click and collect. Nothing in the knowledge said either; David confirmed collection is available, so db mode was right by chance.
- Maxi-Cosi on a Minu V2: db mode said no Minu takes another brand's capsule. The live answer recommended the Minu V2 Car Seat Adapter, which was right: David confirmed on 1 October 2026 that the Minu V2 takes the Mesa and Maxi-Cosi. The "no Minu" rule (Melanie, 10 September 2026) applies to the Minu V3 and Minu Duo only.

Blank or cut off: one question about Vista V2 double adapters gets an empty reply in both modes, and three answers stop mid-sentence (three live answers did too). The chat allows 700 output tokens; some replies run out. This is separate from the knowledge base.

## Findings

- Every confirmed fact is right in db mode. The one answer made worse by the knowledge base (Maxi-Cosi on a Minu V2) came from a rule that was too broad, now corrected.

## Changes after David's answers (1 October 2026)

- Added: click and collect from the Braeside showroom; what the Replacement RumbleSeat Adapters are for; which capsules fit the Minu V2 (list from the Minu V2 Car Seat Adapter listing).
- Corrected: the "no Minu takes another brand's capsule" wording now applies to the Minu V3 and Minu Duo only, in five entries and two new corrections of website answers (Minu Duo "What fits" and "Do I need adapters for the pram?").
- Corrected: bassinet on top with a RumbleSeat underneath, facing backwards, fits but is very tight and is not a recommended setup (article 9000116871).
- Confirmed as already written: ex-display from UPPAbaby Australia carries three years; Tune-Up Days need no registration.
- Rechecked on the preview in db mode: all four changed answers correct.
- Still in the website build (uppababy-site, not this repo): adapters._meta.minuThirdParty and the Minu note in the adapters data still say no Minu takes another brand's capsule. They need the same correction so the prompt does not disagree with the knowledge base.
- max_tokens raised from 700 to 2000 in the chat route. Live logs since 21 September 2026: 7 of 328 replies empty and about 10 cut off. On the preview, a conversation that came back blank 2 times in 4 then answered 6 times in 6, and the four real questions that were blank or cut off all answered in full.
