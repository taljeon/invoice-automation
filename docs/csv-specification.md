# CSV Output Contract

[日本語](ja/csv-specification.md) · [README](../README.md)

The single reference implementation is `src/utils/csvExport.ts`. The main screen and history view call the same helper, so column layout, character handling, and markup calculations are shared. The scope of the line-item array passed by each view may differ.

This specification describes the public demo's implementation contract. It is neither an official specification for every version of the accounting software nor a certification of import compatibility. Where column names cannot be established from the code alone, this document records the actual constants and sources instead of inventing business labels.

## 1. File Representation

| Item | Implementation |
|---|---|
| Column count | Exactly 40 columns per row, A–AN |
| Header | None |
| Delimiter | Comma |
| Field quoting | Every field enclosed in `"..."` |
| Embedded quotes | `"` replaced with `""` |
| Row separator | CRLF (`\r\n`), with no additional newline after the final row |
| Character encoding | Shift-JIS conversion using `encoding-japanese` |
| BOM | Not added separately |
| Download MIME | `text/csv;charset=Shift_JIS;` |
| Numeric strings | JavaScript number string representation, without thousands separators |
| Katakana | Fields R and AN converted to half-width using a custom mapping |

Only defined katakana and symbols are converted. This is not a general normalization function for kanji, hiragana, or all full-width alphanumeric characters. Preservation of characters unavailable in Shift-JIS, emoji, and some extended characters is not guaranteed.

## 2. Pre-export Validation

`getExportErrors` checks the following and reports row numbers:

- Whitespace-only `商品名` or `仕入日`.
- Null or non-finite `数量`.
- Non-finite `単価` or `金額`.

If problems exist, the generator throws an error and the UI asks the user to correct them. It does not replace an uncertain quantity with 0 to produce a file. Explicit zeros, negative numbers, and decimals are accepted as finite numbers. These checks alone do not guarantee a valid date format, registered codes, agreement between quantity × unit price and amount, or correct tax amounts.

## 3. All 40 Columns

`halfWidth(s)` means `toHalfWidthKatakana(s)`, and `salesPrice` follows the markup and rounding formula below. An `empty` value is still one CSV field, `""`.

| No. | Column | `purchase` | `sales` |
|---:|:---:|---|---|
| 1 | A | `1` | `1` |
| 2 | B | `1` | `1` |
| 3 | C | empty | empty |
| 4 | D | `仕入日` | `仕入日` |
| 5 | E | empty | empty |
| 6 | F | `14` | `24` |
| 7 | G | `1` | `1` |
| 8 | H | `1` | `1` |
| 9 | I | `1` | `1` |
| 10 | J | `1` | `1` |
| 11 | K | `getCustomerCode(得意先名)` | same |
| 12 | L | empty | empty |
| 13 | M | empty | empty |
| 14 | N | `1` | `1` |
| 15 | O | `1` | `1` |
| 16 | P | `getShipCode(得意先名)` | `getSupplierCode(仕入先名)` |
| 17 | Q | empty | empty |
| 18 | R | `halfWidth(商品名)` | same |
| 19 | S | `13` | `13` |
| 20 | T | `1` | `1` |
| 21 | U | empty | empty |
| 22 | V | empty | empty |
| 23 | W | empty | empty |
| 24 | X | `数量` | same |
| 25 | Y | `単価` | `Math.round(単価 × rate)` |
| 26 | Z | Stored `金額` | `salesPrice × 数量` |
| 27 | AA | empty | empty |
| 28 | AB | empty | empty |
| 29 | AC | empty | empty |
| 30 | AD | empty | empty |
| 31 | AE | empty | empty |
| 32 | AF | empty | empty |
| 33 | AG | empty | empty |
| 34 | AH | empty | empty |
| 35 | AI | empty | empty |
| 36 | AJ | empty | empty |
| 37 | AK | `2` | empty |
| 38 | AL | empty | empty |
| 39 | AM | empty | empty |
| 40 | AN | `halfWidth(仕入先名)` | `halfWidth(得意先名)` |

`伝票番号`, `摘要`, `課税区分`, internal IDs, filenames, and paths are not output directly in this CSV. In particular, do not infer that the empty C/E columns automatically store the voucher number displayed in the UI.

## 4. Synthetic Name-to-Code Mappings

These values were created to demonstrate the example data and structure.

| Kind | Synthetic name | Synthetic code |
|---|---|---|
| Customer | サンプル一号 / サンプル二号 / サンプル三号 | 101 / 102 / 103 |
| Vessel abbreviation | The same three vessels | D1 / D2 / D3 |
| Supplier | サンプル部品株式会社 | 201 |
| Supplier | 架空機械株式会社 | 202 |
| Supplier | 例示商事株式会社 | 203 |

Customer and vessel lookups try an exact match, then check whether the input contains a registered name. Supplier lookup tries an exact match, then a substring match in either direction. When multiple candidates exist, list order can affect the result.

- Unmatched customer: `0000`.
- Missing vessel name: empty; present but unmatched vessel name: the name itself.
- Unmatched supplier or empty supplier name: `9999`.

The current export looks up the **name** again rather than using the editable code field itself. This is the same in the main screen and history. In a real environment, adapt the mappings and approval process to your own master, and do not mistake unmatched fallback codes for valid import-ready values.

## 5. Demo Sales Policy

`DEMO_SALES_POLICY` contains synthetic rules so that no actual customer pricing terms are included.

```ts
threshold = 100_000
regularMultiplier = 1.10
volumeMultiplier = 1.05

purchaseTotal = sum(items.map(item => item.金額))
rate = purchaseTotal < threshold ? regularMultiplier : volumeMultiplier
salesPrice = Math.round(item.単価 * rate)
salesAmount = salesPrice * item.数量
salesTotal = sum(all salesAmount)
```

Exactly 100,000 receives the 1.05 multiplier. The sales unit price is first rounded to an integer and then multiplied by quantity; the sales line amount is not rounded to an integer again. A fractional quantity can therefore produce a fractional salesAmount. JavaScript `Math.round` rounds positive half-integer values up to the next integer. There is no separate currency-precision or negative-number rounding policy.

Purchase CSV uses the edited `金額` as stored, without automatically correcting a mismatch with `数量 × 単価`. That mismatch affects the threshold total. Sales CSV recalculates from unit price × quantity, so its amount can differ from the purchase amount multiplied directly by the rate.

## 6. Calculation Examples

Default synthetic data after quantity review:

| Document / row | Quantity | Purchase unit price | Purchase amount | Rate | Sales unit price | Sales amount |
|---|---:|---:|---:|---:|---:|---:|
| DEMO-001 / filter | 2 | 1,200 | 2,400 | 1.10 | 1,320 | 2,640 |
| DEMO-001 / packing | 1 | 8,000 | 8,000 | 1.10 | 8,800 | 8,800 |
| DEMO-002 / valve | 2 | 4,750 | 9,500 | 1.10 | 5,225 | 10,450 |
| Total | | | 19,900 | | | 21,890 |

The valve row initially displays a null quantity. A CSV containing that row cannot be generated until the user checks the PDF and enters its quantity of 2. Per-PDF purchase/sales totals are 10,400/11,440 for the first document and 9,500/10,450 for the second.

Rounding-order example: with unit price 1,005, quantity 3, and rate 1.10, the result is `round(1,105.5) × 3 = 3,318`. This differs from 3,317, obtained by multiplying the total purchase amount of 3,015 by 1.10 and rounding once. The UI's sales total also uses the shared helper's **sum of per-row results**.

Export-scope example: separately exporting documents with purchase totals of 60,000 and 50,000 gives both a rate of 1.10. Exporting them together gives a total of 110,000 and a rate of 1.05. Fixing this demo policy per PDF would require an explicit change to the helper's policy scope.

## 7. Filenames and Usage Boundaries

The main screen downloads `仕入伝票_YYYYMMDD.csv` and `売上伝票_YYYYMMDD.csv`. History includes the document name, as in `仕入伝票_<document-name>_YYYYMMDD.csv`. The date comes from the execution time's ISO date, so local and UTC date boundaries can differ.

Quote escaping prevents commas, line breaks, and quotation marks from breaking the column layout. It is not a general sanitizer against formula interpretation in spreadsheet software. Arbitrarily changing user input can also change accounting data, so requirements for accounting imports and general spreadsheet viewing must be decided separately.
