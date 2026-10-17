# Engine rules (M1)

Synthetic teaching data. Every output is a **Scenario**, not a guaranteed recovered amount.

## Order of checks (per lot, per route)
1. Input validation: positive whole quantity, required fields, confidence in [0,1], finite non-negative price multiplier, known route.
2. Eligibility and safety: safety hold, unknown condition, blocked category, allowed condition, minimum inspection confidence.
3. Capacity: units must fit remaining capacity.
4. Only then money. A blocked route has all numbers `null` and is never recommended, whatever its profit.

Scrap stays available for a safety-held or unknown-condition lot (it is the safe exit) unless its own category rules block it.

## Formulas (per lot, INR)
Gross, processing and handling are kept separate. Original product cost is sunk and never added back.

| Route | Gross | Processing | Handling |
|---|---|---|---|
| resale | unit_price x price_multiplier x qty x confidence | 0 | handling_per_unit x qty |
| refurbish | post-refurb price x price_multiplier x qty x success_rate x confidence | refurbish_cost_per_unit x qty | handling_per_unit x qty |
| scrap | scrap_value_per_unit x qty | 0 | handling_per_unit x qty |

Net = gross - processing - handling. Reference check (10 units, price 100, refurbish 20, handling 5, success and confidence 100%, scrap 10 with no handling): resale 950, refurbish 750, scrap 100.

## Scenario range
Low: price x0.90 and confidence -0.15. High: price x1.10 and confidence +0.15. Confidence is clipped to [0,1]. Scrap does not depend on price or confidence, so its range collapses to the base value.

## Best route and tie-break
Highest expected net among permitted routes. Ties: resale, then refurbish, then scrap. Returns `None` when nothing is permitted. A permitted route that loses money (handling exceeds recovery) is flagged in its reason; it is only chosen if it is the least-bad permitted option.
`incremental_value_vs_next_best` = best net minus next-best permitted net (`None` if fewer than two permitted).

## Allocator
Lots sorted by best net per unit (capacity ignored for ordering), ties by `lot_id`. Each lot goes whole to its best permitted route that still has capacity; otherwise it cascades; otherwise it is `Unallocated`. Lots are split-free in this prototype. Inputs are deep-copied and capacity state is local to each call.

## Break-even
Post-refurbishment unit price at which refurbish net equals scrap net: (refurbish cost + handling + scrap net) / (success rate x confidence). In the reference case this is 35.

## Limits
- Inspection confidence is a simplifying haircut on expected value, not a calibrated probability.
- Whole-lot allocation only; no partial splits across routes.
- All prices, rates and capacities are assumptions from synthetic data; nothing here is observed revenue.
