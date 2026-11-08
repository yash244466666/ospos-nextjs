# 10 — Supplement: verified exact-behaviour findings, fixtures and residual obligations

**Companion to** `10-receipts-tokens-barcode-email.md` (master report, current 516-line version).
**Upstream:** OSPOS 3.4.3 @ `603b2c7c8fd5f3b2d64a3730e0f7ea38c82872ea`, `/home/yash/ospos`.
**Target:** `/home/yash/Desktop/yash/ospos-nextjs`.
**Status:** analysis only; no source file modified. This file contains only findings that either (a) are not stated in the master report at the same level of exactness, or (b) were verified by execution during this analysis (ICU/NumberFormatter outputs, cipher contract, parse fixtures). It is not a replacement for the master report.

---

## A. Token engine — exact semantics not captured at this granularity

### A.1 Render order is date-expand → scan → resolve-once-per-ID → multi-pair `str_replace`

`Token_lib::render()` (`app/Libraries/Token_lib.php:62-79`) expands `%` date directives **before** scanning (`:64-66`), returns early if no token specs were found (`:70-72`), resolves one value per token **ID** (`:74-76`, `:217-231`), then calls `str_replace($tokens_to_replace, $token_values, $text)` (`:78`). Two consequences worth encoding in tests:

1. A sequence token repeated with different widths resolves once. `format = "{ISEQ:4}-{ISEQ:6}"`, counter 40 → `0041-000041` and `last_used_invoice_number` becomes 41 **once**.
2. A token value containing another token spec is eligible for re-replacement in the same pass because `str_replace` applies pairs sequentially. Example fixture (contrived): customer name `{CO}` and text `{CU}-{CO}` → the `{CU}` replacement inserts `{CO}`, and if the `CO` pair runs later it is replaced too. Do not "fix" this silently; decide and document.

### A.2 Unknown-token and padding exactness

- Unknown ID with a width → zeros: `{FOO:3}` → `000` (because `str_pad('', 3, '0', STR_PAD_LEFT)`).
- Unknown ID without width → empty string (`Token_lib.php:233-242`).
- `{TOKEN:0}` → unpadded; `{TOKEN:00}` → unpadded (length int-casts to 0); values longer than the width are never truncated.
- Non-numeric widths are a crash path: `{CO:abc}` reaches `str_pad(..., 'abc', ...)`, which under PHP 8 throws `TypeError` (non-numeric string→int coercion). `{CO:4x}` coerces to 4 with a deprecation. (inference from PHP coercion; not covered upstream.)
- Scan grammar permits any non-space/non-brace/non-colon ID, so `{customer}`, `{a}`, `{123}`, `{I}` all scan; target's `[A-Z]{2,4}` (`src/lib/token/index.ts:6`) rejects them.

### A.3 Token registry duplication and override precedence

`Token::get_tokens()` lists `Token_quote_sequence` twice (`app/Models/Tokens/Token.php:45,47`). Harmless because `resolve_token()` returns the first ID match (`Token_lib.php:235-238`). More important: caller tokens are merged **before** built-ins (`:235`), so the email path can force `{ISEQ}` to the already-allocated number by passing `new Token_invoice_sequence($number)` (`app/Controllers/Sales.php:1061-1062`). `QSEQ` has no value-taking constructor (`Token_quote_sequence.php:15-19`), so `{QSEQ}` in the email template would allocate a **new** quote number as a side effect.

### A.4 Count-token exactness

- `CO`: `COUNT(*) FROM sales WHERE invoice_number IS NOT NULL` — includes suspended, canceled, quotes-with-invoice-number, and rows from every year (`app/Models/Sale.php:357-363`).
- `SCO`: same predicate **plus** `sale_status = 1` (`Sale.php:1330-1337`).
- `YCO`/`QCO`: `date('Y')` compared to `DATE_FORMAT(sale_time, "%Y")`, field `IS NOT NULL`, returns `start_from + count` with `start_from = 0` (`Sale.php:381-410`). **No `+1`** — first invoice of a year yields `0`. A target implementation that returns `count + 1` is off by one; the master target does exactly that (`src/lib/token/index.ts:129`, `:138`).
- `Token_invoice_count` ignores its constructor argument: `get_value()` tests an undefined local `$value`, always true, so `new Token_invoice_count('POS 12')` still returns the global count (`app/Models/Tokens/Token_invoice_count.php:34-38`). Preserve with a test or explicitly fix.
- `Token_customer` returns `''` whenever it was constructed with non-empty `customer_info` (`Token_customer.php:41-51`). The email path always passes `(array)$saleData`, so `{CU}` is empty in the email body even though the default `invoice_email_message` is `Dear {CU}, …` (`initial_schema.sql:49` after `$CU`→`{CU}` migration, `3.0.2_to_3.1.1.sql:314`).

### A.5 `parse()` regex construction — exact failure modes

`parse()` replaces only the **first** scanned spec per token ID with `"({$token->get_value()}{$length})"` and then runs `preg_match("/$pattern/", $string)` (`Token_lib.php:188-215`). Verified consequences:

| Condition | Result |
|---|---|
| duplicate token in one pattern, e.g. `{I:4}{I:4}` | first spec replaced once; second stays literal text in the regex |
| literal regex metacharacters in the pattern (`.`, `+`, `(`) | interpreted as regex, not text |
| `/` in the pattern | breaks the `/…/` delimiter → `preg_match` emits a warning and returns false (no match) |
| length non-numeric (`{I:abc}`) | regex quantifier `{abc}` is a PCRE compile error → warning/false, not a PHP fatal |
| no tokens supplied for a scanned ID | that spec stays literal text (the loop only replaces on a match in `$tokens`) |
| non-string element in `barcode_formats` | `TypeError` at the `string $pattern` boundary (fatal) |
| extra input characters | ignored (unanchored match) |

### A.6 `parse_barcode` state bleed and fixtures

`Token_lib.php:169-186`. For each configured format in order it **overwrites** quantity/price even when that format did not match (`:178-181`). Therefore with two formats the last format decides quantity/price; the item id survives from the earlier match only because the code re-feeds the current (already replaced) input.

Exact fixtures (format array → input → `(quantity, price, item)`):

1. `["{I:4}{W:4}{P:3}"]`, `001212340099` → regex `(\w{4})(\d{4})(\d{3})` → `("1.234", 99.0, "0012")`.
2. `["{I:13}"]`, `5901234123457` → `("1", null, "5901234123457")` (no `W`, so quantity 1 and price null).
3. `["{W:5}{I:6}"]`, `00123000112` → `("0.123", null, "000112")`.
4. `[]` / `'[]'` / `'null'` / invalid JSON → quantity `"1"`, price unchanged (null), item unchanged.
5. `["{I:4}","{W:5}"]`, `00123` → first no match, second `W=00123` → `("0.123", null, "00123")` (item unchanged; demonstrates the bleed).
6. `["{I:4}"]`, `ABCD-1234` → `\w{4}` matches `ABCD` at offset 0 → item `ABCD`, quantity 1, price null.
7. `["{P:3}{I:3}"]`, `099123456` → `P=099`, `I=123` → price 99.0, item `123`; trailing `456` ignored.

Weight is grams: `(int)W / 1000`, producing int when evenly divisible, float otherwise, then string-coerced into the `?string &$quantity` parameter.

Formats storage contract: JSON **array of pattern strings**, default `'[]'` (`app/Database/Migrations/sqlscripts/3.0.2_to_3.1.1.sql:309`), edited as tagsinput (`app/Views/configs/barcode_config.php:131-143`), saved via `json_encode($_POST['barcode_formats'])` (`app/Controllers/Config.php:1058`). Target's `{name,value}` object model (`src/lib/token/index.ts:74-98`) is a different contract; see §G.1.

---

## B. Strftime — exact ICU outputs (executed)

Computed with PHP 8.5.12 + ICU 78 (extension loaded only for the probe), fixed instant `2026-11-08 14:05:09`, `Asia/Dhaka`. The formatter is constructed with locale `null` and timezone `null` (`Token_lib.php:83-90`), so **app language is irrelevant**; these values reflect the process/ICU default locale. `en_US`:

```
%a Sun   %A Sunday   %b Nov   %B November   %c 2026-11-08 14:05:09
%C 20    %d 08       %D 11/08/26   %e 8      %F 2026-11-08
%g 26    %G 2026     %h Nov   %H 14      %I 02
%j 312   %l %l       %m 11    %M 05      %n <LF>
%p PM    %P PM       %r 02:05:09 PM   %R 14:05   %S 09
%t <TAB> %T 14:05:09 %u 1     %U 46      %V 46
%w 1     %W 46       %x 2026-11-08   %X 14:05:09   %y 26
%Y 2026  %z +06:00   %Z GMT+6   %% %
```

Locale deltas for the same instant:

- `en_GB`: `%U/%V/%W = 45`, `%u/%w = 7`, `%p/%P = pm`.
- `fr_FR`: `%a dim.`, `%A dimanche`, `%b/%h nov.`, `%B novembre`, `%Z UTC+6`, week `45`, `%u/%w 7`.
- `de_DE`: `%a So.`, `%A Sonntag`, `%b/%h Nov.`, `%B November`, `%Z GMT+6`, week `45`.
- `es_ES`: `%a dom`, `%A domingo`, `%b/%h nov`, `%B noviembre`, `%p p. m.`, `%r 02:05:09 p. m.`, week `45`.
- `bn_BD`: **digits are localised** — `%d ০৮`, `%Y ২০২৬`, `%H ১৪`, `%j ৩১২`, `%U ৪৬`, `%z` stays `+06:00`, `%Z GMT +৬`.

Hard facts the port must reproduce:

- `%l` is **not** whitelisted (`validStrftimeFormats`, `Token_lib.php:53-57`) even though the map contains it — output is literal `%l`.
- `%c` and `%x` are deliberately overridden to fixed ISO patterns, not locale representations (`:115-125`).
- `%C` is manual `intdiv(year,100)` padded to 2 (`:111-113`) → `20`.
- `%j` maps to ICU `D` (day-of-year, **unpadded**); `%e` maps to `d` (day-of-month, unpadded).
- `%U`, `%V`, `%W` all map to locale week-of-year (`w`/`ww`); `%V` is **not** ISO week; `%U` is not strictly Sunday-first, and `%W` not strictly Monday-first — they follow locale week rules.
- `%u`/`%w` map to ICU `e`/`c` — localized day numbers in 1..7 with locale first-day, not ISO (`Sunday=7`) / Sunday-zero.
- `%s` maps to ICU `ss` → seconds-of-minute, **not** epoch seconds.
- `%z` → ISO extended offset (`ZZZZZ`); `%Z` → short specific non-location / localized GMT (`z`) e.g. `GMT+6`, `UTC+6`, `GMT +৬`.
- `%%`, `%n`, `%t` handled before the map; `%` alone and `%` + non-letter stay literal.
- Any `%` triggers the whole expansion pass, so admin text containing percentages is exposed to accidental expansion (`%B` → month name, etc.).

Upstream test pinning (all date-dependent, shape assertions only): `tests/Libraries/Token_libTest.php:18-45` (no-token/percent/`%-`), `:76-88` (valid tokens, empty), `:110-122` (`%%`), `:124-136` (braces), `:138-157` (long/multiple dates/%Y), `:159-178` (`%m/%d/%Y-%m-%d`), `:180-204` (`%B/%A/composite`), `:206-220` (`%q` survives, `%z`), `:229-304` (`%F,%D,%T,%R,%C,%c,%n,%t,%x`), `:306-313` (`%h`).

Residual obligations: implement `%`-directive expansion with the exact outputs above, locale/digit behaviour, fixed composites, and literal fallbacks; do **not** reimplement POSIX strftime. Do not implement the target's brace-directive mechanism (`src/lib/token/index.ts:7,29-60`).

---

## C. Number/currency formatting — verified `NumberFormatter` behaviour

### C.1 The `thousands_separator` toggle is a no-op

`to_decimals()` calls `$fmt->setTextAttribute(NumberFormatter::GROUPING_SEPARATOR_SYMBOL, '')` when the config is empty (`app/Helpers/locale_helper.php:446-448`), and `parse_decimals()` does the same (`:493-495`). Executed probe: `setTextAttribute(...)` returns `true` but `format(1234567.891)` still returns `1,234,567.89`; the working API is `setSymbol(NumberFormatter::GROUPING_SEPARATOR_SYMBOL, '')`, which returns `1234567.891`. Therefore grouping is **always** locale-default in 3.4.3 regardless of the `thousands_separator` setting. The port must reproduce the observed behaviour (or make an explicit, documented fix); parity tests should assert grouped output with `thousands_separator=0`.

### C.2 Exact outputs (PHP 8.5/ICU 78)

| Expression | Value |
|---|---|
| `to_currency("1234567.891")`, en_US, 2 dp | `$1,234,567.89` |
| `to_currency("-12.3")` | `-$12.30` |
| `to_currency_no_money("1234.5")` | `1,234.50` |
| `to_decimals("1234.5")` (no decimals key) | `1,234.50` — `DEFAULT_PRECISION=2`, **not** `currency_decimals` |
| `to_decimals("1234.5","quantity_decimals")` with `0` | `1,234` (ICU half-even; 1235.5→`1,236`) |
| `to_currency` de_DE, symbol `€` | `1.234.567,89 €` (NBSP U+00A0 before symbol) |
| `to_currency` fr_FR, symbol `€` | `1 234 567,89 €` (narrow NBSP U+202F) |
| `to_tax_decimals(0)` | `0` (int; `empty(0)` short-circuit, `locale_helper.php:412-414`) |
| `to_tax_decimals('')` | `''` |
| `to_currency(null)` | `''` (`:437-439`) |
| `to_decimals('', 'currency_decimals')` | `$0.00` |
| `parse_decimals("1,234.56", 2)` en_US | `1234.56` |
| `parse_decimals("1.234,56", 2)` en_US | `1.234` |
| `parse_decimals("1.234,56", 2)` de_DE | `1234.56` |
| `parse_decimals("abc")` | `false` |
| `parse_decimals("1e20")` | `false` (`> 1e14`) |
| `parse_decimals("")` / `parse_decimals("0")` | `''` / `'0'` (string; `empty()` early return) |
| `parse_quantity("1.234")` with quantity_decimals `0` | `1.23` (because `!$decimals` forces `currency_decimals`) |
| `is_right_side_currency_symbol()` en_US/en_GB/ja_JP | `false` (pattern starts `¤`) |
| `is_right_side_currency_symbol()` de_DE/fr_FR/es_ES/bn_BD | `true` (pattern ends `¤`) |

`parse_decimals` applies `FRACTION_DIGITS` only in the falsy-`$decimals` branch (`:488-491`); a non-zero `$decimals` is never set on the formatter. `MAX_PRECISION = 1e14`, `DEFAULT_PRECISION = 2` (`app/Config/Constants.php:171-172`).

Currency-symbol override uses `setSymbol(NumberFormatter::CURRENCY_SYMBOL, config.currency_symbol)` (`:303`, `:449`), so the configured symbol replaces the CLDR symbol but the locale still controls placement/spacing/digits.

### C.3 `to_decimals` call-site contract

Every discount cell calls `to_decimals()` **without** a decimals key, so it always prints two fraction digits, independent of `currency_decimals` (`receipt_default.php:89`, `receipt_short.php:75`, `invoice.php:149`, `tax_invoice.php:149`, `quote.php:136`, `work_order.php:132`). Ports must not "improve" this to `currency_decimals` in those six cells without a product decision.

### C.4 Date-format converter tables (PHP-only surfaces)

`dateformat_momentjs` (`locale_helper.php:517-560`), `dateformat_mysql` (`:565-607`), `dateformat_bootstrap` (`:613-652`) are exact `strtr` maps; the surprising entries that must be replicated if these surfaces are ported:

- MySQL: `h→%H`, `H→%k`, `g→%l`, `G→%k`, `i→%i`, `s→%S`, `u→%f`; `F`, `N`, `S`, `w`, `z`, `W`, `L`, `o`, `a`, `B` → empty.
- Bootstrap: `g→H`, `G→h`, `h→HH`, `H→hh` (swapped), `D/j→d`, `l→dd`, `M→M`, `n→m`.
- Moment: `S→o`, `z→DDD`, `w→e`, `N→E`, `u→SSS`, `U→X`; `t,L,I,O,P,T,Z,c,r` → empty.

Target has none of these three converters.

---

## D. Barcode — additions beyond the master summary

### D.1 Type matching is case-insensitive upstream, case-sensitive in target

Picqer dispatches on `strtoupper($type)` (`vendor/picqer/php-barcode-generator/src/BarcodeGenerator.php:116`). Target indexes `SUPPORTED_BARCODES[type]` exactly (`src/lib/barcode/index.tsx:55`) and its own config select stores lowercase `code39|code128|ean13|upca` (`src/lib/config/tabs.ts:172-180`) — so selecting **Code 39** or **EAN-13** in the target UI silently emits **Code 128**. This is a live bug independent of migration.

### D.2 Content selection

- Upstream values are only `id`/`number` (`app/Views/configs/barcode_config.php:98-118`); any value other than `id` means "item_number, else name" (`Barcode_lib.php:95-100`). `??` does **not** fall back on an empty string: an empty `item_number` encodes as `''`.
- Target accepts `id|item_number|name` (`src/lib/barcode/index.tsx:21,71-75`), but its config UI stores `number` (`src/lib/config/tabs.ts:165-171`), which `getBarcodeValue` does not recognise → falls through to the item **id**. `name` is an upstream-unsupported extension.
- Upstream label rows: `company_name` is supported; `not_show` and unknown values render empty; category/price rows are prefixed with the `Items.*` language string and prices run through `to_currency` (`Barcode_lib.php:167-189`). Target supports neither `company_name` nor the prefixes/currency and does not truncate to 40 chars (`src/lib/barcode/index.tsx:92-128`). First-row option sets differ upstream: row 1 lacks `item_code`, rows 2/3 include it (`barcode_config.php:145-202`); target treats all three rows identically (`tabs.ts:185-187`).

### D.3 `barcode_generate_if_empty` is a no-op upstream

`Items::getGenerateBarcodes()` writes the still-empty `item_number` back (`app/Controllers/Items.php:571-579`); no generated number is produced. Target's `generateIfEmpty` is likewise never used to assign a number (`src/app/(secure)/items/generate-barcodes/page.tsx:47`; `src/lib/barcode/index.tsx` has no assignment path). Do not implement "magic" generation without a product decision; parity = no-op.

### D.4 Error handling

`generate_barcode()` and `generate_receipt_barcode()` catch `Exception`, echo `Caught exception: <msg>` and the stack trace into the response, then return `''` (`Barcode_lib.php:114-119`, `:131-134`). `display_barcode()` returns the literal English `"Item number or Item ID not found in the item array."` when `item_id` or both `item_number`/`name` are missing (`:144-159`). `barcode_num_in_row = 0` fatals on modulo (`barcode_sheet.php:33`). Target swallows generation errors into a default `code128` fallback and `displayBarcode` returns empty strings (`src/lib/barcode/index.tsx:55,92-128`).

### D.5 bwip-js mapping risks (verification required)

Target mapping (`src/lib/barcode/index.tsx:4-14`) loses semantics: `C39+/C39E/C39E+ → code39`, `S25+/I25+ → std25/int25`, `MSI+ → msi` (checksum variants not requested), `C128A/B/C → code128` (forced code set lost). Whether bwip-js 4.11.1 accepts every bcid used (`pharmacode2`, `rms4cc`, `imb`, `std25`, `int25`, `ean2`, `ean5`, `code32`) could not be verified — `node_modules` is absent in the checkout (**unknown**). Also target sets `includetext: true` globally (`:60-63`), unlike Picqer's text-free SVG, and never passes the configured font (`fontname`/`fontfamily`). Width is interpreted as bwip module width on the preview (`cfg.width/100`, `generate-barcodes/page.tsx:15`) and ignored in the PDF (`barcode/index.tsx:140-143`), whereas upstream width is a CSS pixel size on the SVG (`barcode_sheet.php:19-24`) and Picqer widthFactor is fixed at 2 (`Barcode_lib.php:113`).

### D.6 PDF/sheet layout differences

Upstream sheet: HTML table, `border-spacing` in px, width percent, rows broken every N cells, labels as HTML with currency, fonts via `public/css/barcode_font.css` `@font-face` (`barcode_sheet.php:18-40`). Target PDF: react-pdf A4, cell `100/N %`, per-cell margin in points (not px), 1pt border, PNG image at 90% width, up to 3 unformatted text rows, Helvetica fallback (no `@font-face`) (`src/lib/barcode/index.tsx:130-163`). Target PDF cannot render ids outside the first 200 items (`src/app/api/items/barcodes-pdf/route.ts:11-14`) and its preview page uses different defaults than the library (page width 150 vs 100, spacing 5 vs 20, rows `name/category/cost_price` vs `id/name/unit_price`) (`generate-barcodes/page.tsx:34-48` vs `barcode/index.tsx:36-52`).

---

## E. Documents — verified per-template facts and upstream defects

### E.1 Receipt tax-indicator values and labels

`taxed_flag` is `T` or a single space (`app/Libraries/Tax_lib.php:155-161`; `app/Language/en/Sales.php:129,195`). Only `receipt_default.php:58-73` renders it. Discount labels: `Sales.discount = "Disc"` (`Sales.php lang:51`), `Sales.discount_included = "% Discount"` (`:53`), `Sales.customer_discount = "Discount"` (`:33`). Change labels: `Sales.check_balance = "Check remainder"` (`:19`), `Sales.change_due = "Change Due"` (`:16`), `Sales.amount_due = "Amount Due"` (`:6`). `only_sale_check` compares the **full** payment type to `Check`; gift-card detection uses `explode(':')[0]` (`receipt_default.php:140-144`).

### E.2 Payment type encoding (affects every template's `explode(':')`)

Gift card: controller stores `lang('Sales.giftcard') . ':' . $giftcardNumber` (no space) (`app/Controllers/Sales.php:466-470`). All other types are plain (`Check`, `Cash`, `Debit Card`, `Credit Card`, `Due`, `Bank Transfer`, `Wallet`, `Rewards`, `Cash Adjustment`, work-order `Cash Deposit`/`Credit Deposit`). `reference_code` is stored alongside, not appended to the type (`Sale_lib::addPayment`, `app/Libraries/Sale_lib.php:590-618`). Therefore `splitpayment[0]` is the display label for gift cards and identical to the type otherwise.

### E.3 Quote/work-order payments are printed positive

`quote.php:190` and `work_order.php:180` call `to_currency($payment['payment_amount'])` without `* -1`, unlike receipts/invoices (`receipt_default.php:147`, `invoice.php:201`). This asymmetry is intentional-looking but must be matched.

### E.4 Upstream template defects (do not "fix" silently)

1. `tax_invoice.php:211` malformed `</td>` after `Sales.giftcard_balance` → broken markup.
2. `tax_invoice.php:234-236` declares the SVG barcode as `data:image/png;base64,<svg>` → broken image. (Contrast `receipt_email.php:161` and `invoice_email.php:180`, which correctly use `data:image/svg+xml;base64,<base64_encode($barcode)>`.)
3. `tax_invoice.php` column-count drift: discount column always rendered (`:127`) but `$invoice_columns` increments only when `$discount > 0` (`:129-133`); serialized row always emits an HSN cell and `colspan = invoice_columns - 2` (`:155-162`).
4. `receipt_email.php:161` `alt=<?= '$sale_id' ?>` is the literal string `$sale_id` (single-quoted), not the id; same line has unescaped `base64_encode($barcode)` (safe for base64 but inconsistent).
5. `work_order_email.php` reads undefined `$tax_exclusive_subtotal` (not returned by `_load_sale_data`) (`:112`) and iterates `$taxes as $name => $value` on associative row arrays (`:115-121`) → warnings/`0.00`.
6. `work_order_email.php:22` links the stylesheet by URL instead of inlining it; `quote_email.php:40` and `work_order_email.php:39` use relative logo paths that email clients cannot resolve; `invoice_email.php:42` reads `uploads/<logo>` relative to CWD.
7. `receivings/receipt.php:27` passes a numerically indexed array to the print partial (`['print_after_sale', $print_after_sale, 'selected_printer' => …]`), so `$print_after_sale` is undefined inside `print_receipt.php` → receiving auto-print never triggers.
8. `receivings/receipt.php:118` prints `$amount_change` raw (no currency formatting).
9. `quote.php:77` / `work_order.php:79,95` double-escape: `esc(nl2br(esc(...)))`.
10. `receipt_default.php:35` prints `$transaction_time` unescaped; `receipt_short.php:44` prints the invoice number unescaped; `work_order.php:75` prints `$sales_work_order` unescaped.
11. `print_silently` is inverted: silent printing is requested only when the setting is **false** (`partial/print_receipt.php:43-46`).
12. Print margins are passed to jsPrintSetup as the configured values, which the code comments describe as **millimetres**, while the config UI labels them px (`receipt_config.php:254-335`; `print_receipt.php:13-17`).
13. If no jsPrintSetup printer matches `localStorage[<receipt_printer|invoice_printer|takings_printer>]`, `printdoc()` prints nothing; there is no `window.print()` fallback in that branch (`print_receipt.php:32-55`).
14. `custom_invoice`/`custom_tax_invoice` are advertised and whitelisted but no view files exist (`app/Libraries/Sale_lib.php:104-109`; `app/Views/sales/` listing) → selecting them throws at render time.
15. `getSendPdf` for `tax_invoice` looks for `sales/tax_invoice_email` (does not exist) and `tax_invoice.php:36` calls the default `invoice` type anyway; the tax-invoice email is effectively the invoice email.

### E.5 Data contract details the master's builders must carry

For byte-level parity each line needs: `item_id`, `item_number`, `name` (+ `NAME_SEPARATOR . pack_name` for packs, `| `), `attribute_values`, `description`, `serialnumber`, `quantity`, `price`, `cost_price`, `discount`, `discount_type`, `total`, `discounted_total`, `print_option`, `is_serialized`, `allow_alt_description`, `hsn_code`, `taxed_flag`, `stock_name`, `item_location`, `stock_type`, `item_type`. Upstream rebuilds these on every read by copying the sale into the cart (`Sale_lib::copy_entire_sale`, `app/Libraries/Sale_lib.php:1366-1405`), which re-joins items and attribute values (`add_item`, `:1043-1190`). The target's DB row alone is insufficient: `src/db/schema/sales.ts:27-40` stores only `itemId,line,description,serialnumber,quantityPurchased,discount,discountType,itemCostPrice,itemUnitPrice,itemLocation,printOption`, and `copyEntireSale` sets `itemName:""`, `attributeValues:""`, `total/discountedTotal` ignoring discounts (`src/lib/sale/sale-lib.ts:804-827`). Any document builder must join `items` (name/number/pack/type/stock/hsn/serial flags), `attributeLinks`+`attributeValues` (and `attributeDtvalues`), and recompute totals with `getItemTotal`/`getCartTotals` rather than `unitPrice*qty`.

Taxes must be ordered by `print_sequence ASC` (`app/Models/Sale.php:770-779`); target `getSaleTaxes` has no `orderBy` (`src/lib/sale/sale-model.ts:307-310`).

`amount_change` is `amount_due * -1`, not `paid - total` (`app/Controllers/Sales.php:1270`); it must honour cash rounding (`reset_cash_rounding`, `Sale_lib.php:1455-…`) and the cash/non-cash totals branch (`Sales.php:1252-1268`). Target `change: paid - total` (`src/lib/pdf/data.ts:22-23,39`) ignores discounts, tax-included totals and rounding.

---

## F. Email — exact configuration and format contract

### F.1 `Email_lib` construction

`app/Libraries/Email_lib.php:24-57`:

```
mailType    html
userAgent   OSPOS
validate    true
protocol    config.protocol       default 'mail'
mailPath    config.mailpath       default '/usr/sbin/sendmail'
SMTPHost    config.smtp_host      default ''
SMTPUser    config.smtp_user      default ''
SMTPPass    decrypted config.smtp_pass (only if non-empty && checkEncryption())
SMTPPort    (int)(config.smtp_port ?: 465)
SMTPTimeout (int)(config.smtp_timeout ?: 5)
SMTPCrypto  config.smtp_crypto    default 'ssl'
```

Supported protocols are `mail`, `sendmail`, `smtp` (`app/Views/configs/email_config.php:18-27`). The password is decrypted only when `checkEncryption()` succeeds; the `catch (\EncryptionException $e)` at `:35` uses a **leading backslash**, so it does not match the imported `CodeIgniter\Encryption\Exceptions\EncryptionException` (alias is ignored by a fully-qualified name) — a decryption failure therefore escapes the try/catch (latent upstream bug). `sendEmail()` sets `From` to `config.email` with name `config.company`, `To` to the single recipient, subject/message, attaches the file and calls `setAttachmentCID($attachment)` (`:63-84`); on failure it logs `printDebugger()` and returns false.

`Email_lib::getLogoMimeType()` uses `mime_content_type(FCPATH.'uploads/'.company_logo)` and returns `''` when absent (`:91-101`). `buildLogoImgTag()` returns `<img id="image" src="data:<mime>;base64,<base64(file)>" alt="company_logo">` (`:108-120`).

`MY_Email` is registered as a classmap alias (`app/Config/Autoload.php:160`) but never instantiated or referenced anywhere else — dead code; its `default_*` fields are never populated (`app/Libraries/MY_Email.php:9-48`).

### F.2 Send flows

`getSendPdf(int $saleId, string $type = 'invoice')` (`app/Controllers/Sales.php:1041-1094`):

1. Requires the `reports_sales` grant; 403 JSON `Sales.not_authorized` otherwise (`:1044-1048`).
2. `_load_sale_data($saleId)`.
3. Requires `customer_email`; otherwise returns `success=false` with `Sales.invoice_no_email` (`:1050-1054`).
4. `$number = saleData["{$type}_number"] ?? ""`; subject `lang('Sales.'.$type) . ' ' . $number` (`:1051-1053`).
5. Body = `config.invoice_email_message` rendered with tokens `Token_invoice_sequence($number)`, `Token_invoice_count('POS '.sale_id)`, `Token_customer((array)saleData)` (`:1057-1068`).
6. `mimetype = getLogoMimeType()`, `img_tag = buildLogoImgTag()` (`:1069-1072`).
7. Render `sales/<type>_email` to HTML (`:1073-1074`), `create_pdf`, write to `sys_get_temp_dir()/<lang type>-<number with / → ->.pdf`, send (`:1076-1082`).
8. Message `Sales.<type>_sent|unsent` + recipient; JSON `{success,message,id}`; `sale_lib->clear_all()` (`:1084-1093`).

`getSendReceipt(int $saleId)` (`:1101-1129`) is **dead**: no route/view calls it. It renders `sales/receipt_email` directly as the email HTML (no PDF), regenerates the barcode, and builds `img_tag`. The receipt view's email button and auto-send both call `sendPdf/<id>/receipt` instead (`app/Views/sales/receipt.php:28,41`).

Auto-send: each document view, when `$email_receipt` is truthy, runs `send_email()` on DOM ready via `$.get('/sales/sendPdf/<id>[/type]')` (`receipt.php:24-46`, `invoice.php:32-54`, `tax_invoice.php:32-54`, `quote.php:28-50`, `work_order.php:30-52`). The manual button has id `show_email_button`; the email button is rendered only when `customer_email` is non-empty.

Language strings: `Sales.receipt = "Sales Receipt"`, `invoice = "Invoice"`, `tax_invoice = "Tax Invoice"`, `quote = "Quote"`, `work_order = "Work Order"`; `send_receipt/send_invoice/send_quote/send_work_order`; `receipt_sent/receipt_unsent`, `invoice_sent`, `quote_sent`, `work_order_sent`; `invoice_no_email`, `receipt_no_email`; `not_authorized` (`app/Language/en/Sales.php:75-83,144-153,169-172,193,209-212`).

### F.3 Config save semantics

`Config::postSaveEmail` (`app/Controllers/Config.php:549-594`): when `checkEncryption()` and the posted password is non-empty → `encrypter->encrypt($postedPass)`; otherwise preserve the stored ciphertext. `postSaveMessage` identical for `msg_pwd` (`:601-623`). `postSaveMailchimp` (`:670-698`): when encryption is available, both `mailchimp_api_key` and `mailchimp_list_id` are encrypted when posted non-empty (empty preserves); when not available they are stored plaintext. The UI never re-displays secrets: placeholders use `*_set` booleans (`email_config.php:114-129`, `message_config.php:215-230`, `integrations_config.php:23-30`). `smtp_pass_set`/`msg_pwd_set` derive from non-empty config (`Config.php:270-271`); `api_key_set` likewise (`:279-281`).

### F.4 Target email defects (verified)

- `sendSaleEmail` passes the raw context `ctx` (`{sale,customer,items,payments,taxes,itemTaxes,employee,location}`) to components typed `ReceiptData` (`src/lib/email/index.tsx:84-108`). All `data.company/address/lines/total/...` are `undefined` → blank/throwing PDFs. The only correct builder is `buildReceiptData` (`src/lib/pdf/data.ts:8-40`), used by `email-action.tsx:54-57` — which nothing imports (`grep` shows no callers).
- `src/app/(secure)/sales/email-action.tsx` is dead code; `sendPdfAction` (`actions.ts:217-220`) calls the broken lib. The receipt/invoice pages have no email button.
- Target always uses SMTP and ignores `protocol` (`src/lib/email/index.tsx:31-57`); `mail`/`sendmail` configs return "SMTP host not configured".
- Target default port `587` vs upstream `465` (`:34`; upstream `Email_lib.php:52`).
- Logo: `buildLogoImgTag` returns `cid:company_logo` (`:25-29`) and `sendEmail` attaches `public/uploads/<logo>` (`:47-48`). There is no `public/uploads` directory in the target and no logo upload path (only `setConfig("company_logo","")` removal, `src/app/(secure)/config/actions.ts:57`). Upstream embeds base64 inline.
- Subject/message: hard-coded English `Invoice from <company>` etc. (`:95-108`); body is a generic `<p>Dear …` (`:113`), no token rendering, no per-type template.
- `sendSaleEmail` supports only `invoice|quote|work_order|receipt`, uses `ReceiptDefaultDocument` for receipts (ignores `receipt_template`), and has no `tax_invoice` variant (`:84-109`).
- `sendEmail` returns `{ok,message}` and logs nothing on failure; upstream logs the CI debugger and returns bool.

---

## G. SMS

`app/Libraries/Sms_lib.php:23-76` is a **stub**, not a gateway client:

- Signature `sendSMS(int $phone, string $message): bool` (`:23`) — the first parameter is `int`, so callers pass a numeric phone (a leading `+`/spaces is coerced; letters would raise `TypeError` under PHP 8). Target uses `string` (`src/lib/sms/index.ts:5`) and a Twilio URL.
- Password `config.msg_pwd` is decrypted **unconditionally** when non-empty via `Services::encrypter()` (`:27-32`) — unlike `Email_lib`, this does not call `checkEncryption()` first, so an unprovisioned/invalid key throws (`EncryptionException`/`RuntimeException`) rather than returning false.
- Required parameters: `msg_uid`, decrypted `msg_pwd`, `phone`, `message`, `msg_src`. If any is empty → returns `false` with no request (`:37-47`). Otherwise it sets `$response = true`, `rawurlencode`s the message into a **local copy** (the comment notes the by-value bug, `:51`), and contains only commented-out gateway examples (curl/textmarketer) (`:53-72`). **No network call is ever made**; success means "configured and non-empty".
- Therefore downstream callers (`app/Views/messages/...`, `Messages` controller) cannot observe delivery failure; the UI treats `true` as sent.
- Target (`src/lib/sms/index.ts:5-36`) performs a live Twilio Messages API call with Basic auth built from `msg_uid:msg_pwd`, form-encoded `To/From/Body`, returns `{ok,message}` with Twilio's status text. This is a behavioural divergence, not a port: upstream's contract is a documented proxy stub. Decision required (O-G1): keep the stub contract (and a test that all five params are required) or adopt a real gateway with a new config key.
- Config keys/defaults: `msg_uid ''`, `msg_pwd ''`, `msg_src ''`, `msg_msg ''` (`initial_schema.sql:69-72`). The message tab requires `msg_uid` and `msg_src`; `msg_src` display falls back to `company` when null (`message_config.php:198-247`). Secrets are encrypted at save (§F.3).
- Target config bug: `saveMessageAction` calls `saveConfigTabAction("sms", …)` (`src/app/(secure)/config/actions.ts:49`) while the tab key is `"message"` (`src/lib/config/tabs.ts:151`) → `"Unknown tab"` thrown, so SMS credentials can never be saved through the target UI.

---

## H. Mailchimp

### H.1 Upstream client

`MailchimpConnector` (`app/Libraries/Mailchimp_lib.php:20-124`):

- Endpoint template `https://<dc>.api.mailchimp.com/3.0/`, `<dc>` from `explode('-', api_key)[1]` (`:34`, `:55-61`).
- **Bug:** the constructor reads `$this->config['mailchimp_api_key']` (`:45-47`) although `$config` is a local variable (`:41`) and no `$config` property exists. `isset($this->config[...])` is therefore always false → `$_api_key` stays empty unless an explicit key is passed. `call()` returns `false` when the key is empty (`:71-78`). Net effect: all runtime customer-sync calls (constructed as `new Mailchimp_lib()`, `app/Controllers/Customers.php:28`) are **silent no-ops**; only `Config::_mailchimp($postedKey)` (passed explicitly, `app/Controllers/Config.php:629-637`, `:655`) actually reaches the API.
- Transport: `curl_init`; URL `GET` adds `http_build_query($args)` (`:87-94`); headers `Content-Type: application/json`; `CURLOPT_USERPWD "user:<key>"`; UA `PHP-MCAPI/3.0`; timeout 10 s; `CURLOPT_POST true` **and** `CUSTOMREQUEST <verb>`; SSL verification on; body `json_encode($args)` even for GET/DELETE (`:103-122`). Result is decoded JSON or `false` on transport failure; HTTP error bodies (4xx JSON) are returned as arrays, not treated as failures.
- Methods and payloads (`:135-336`):
  - `getLists($parameters = ['fields'=>'lists.id,lists.name,lists.stats.member_count,lists.stats.merge_field_count'])` → `GET /lists`.
  - `getList($id, ['fields'=>'id,name,stats.member_count,stats.merge_field_count'])`.
  - `getMembers($id, $count, $offset, ['fields'=>'members.id,members.email_address,members.unique_email_id,members.status,members.merge_fields'])`; adds `count`/`offset`.
  - `getMemberInfoById($id,$md5id,['fields'=>'email_address,status,merge_fields'])`.
  - `getMemberInfo($id,$email,[])` → `GET /lists/<id>/members/md5(strtolower(email))`.
  - `getMemberActivity($id,$email,[])` → same + `/activity`.
  - `addMember($id,$email,$first,$last,[])` → POST, body `email_address`, `status='subscribed'`, `merge_fields={FNAME,LNAME}`.
  - `removeMember($id,$email)` → DELETE member hash.
  - `updateMember(...)` → PATCH, `status='subscribed'`, `merge_fields={FNAME,LNAME}`.
  - `addOrUpdateMember($id,$email,$first,$last,$status,[])` → PUT, `email_address`, `status=<status>`, `status_if_new='subscribed'`, `merge_fields={FNAME,LNAME}`.
- Customer integration (`app/Controllers/Customers.php`): decrypts `mailchimp_list_id` in the constructor (`:34-40`); on view fetches member info + activity and computes totals/open/unopen/click/lastopen (`:191-232`); on save calls `addOrUpdateMember(_list_id, email, first, last, posted mailchimp_status or '', ['vip' => posted mailchimp_vip != null])` (`:282-292`); on delete calls `removeMember` per deleted customer (`:357-361`); on CSV import calls `addOrUpdateMember(..., first, '', last)` with **arguments shifted** (`:473`) — third arg is `first_name`, fourth is `''` (intended last name), fifth is `last_name` (intended status) → invalid status sent. Results are ignored everywhere.
- Config: `mailchimp_api_key` and `mailchimp_list_id` are both encrypted at rest (§F.3). `Config::getIndex` decrypts the list id and builds the tab data; `api_key_set` only reports presence (`app/Controllers/Config.php:269-294`). The "check API key" endpoint returns `{success,message,mailchimp_lists}` (`:645-663`).

### H.2 Target client

`src/lib/mailchimp/index.ts`:

- `getDc` matches upstream (`:5-8`); auth header `Basic anystring:<key>` (equivalent), proper HTTP methods (fixes the always-POST quirk), no timeout, no `fields`, `getLists` hard-codes `?count=20` (`:35-37`), `getMembers` hard-codes `count=100` (`:43-45`). No `getMemberActivity`.
- `addMember` accepts a `mergeFields` object instead of first/last (`:52-56`); `updateMember` sends only `merge_fields` (no `status='subscribed'`, `:63-66`); `addOrUpdateMember` omits the `status` parameter and sends only `status_if_new='subscribed'` (`:68-73`).
- Errors surfaced as `{ok:false,message}` with status/body (better than upstream), but no caller consumes the client: there is **no** Mailchimp integration in target customer save/delete/import/CSV code (`grep` finds imports only in the lib itself). Config tab exists (`src/lib/config/tabs.ts:208-215`) but `mailchimp_list_id` is **not** marked `encrypted` (`:213`), diverging from upstream encryption-at-rest; `mailchimp_api_key` is (`:212`).
- No list-probe endpoint/action: the config UI has no `checkMailchimpApiKey` equivalent; the target only stores text fields.

---

## I. Security helpers — exact contracts

### I.1 `.env` locking, atomic writes, backups

`app/Helpers/security_helper.php` (all paths from `Config\SecurityEnv`: `envPath = ROOTPATH/.env`, `backupPath = WRITEPATH/backup/.env.bak`, `lockPath = ROOTPATH/.env.lock` — `app/Config/SecurityEnv.php:23-36`):

- `lockEnvFile()` opens the **separate** lock file with `fopen('c+')` and `flock(LOCK_EX)`; failure logs critical and throws `RuntimeException` (`:16-38`). Windows note: `.env` is never locked directly because rename/delete of an open handle fails there (`:9-15`).
- `unlockEnvFile()` `LOCK_UN` + `fclose` (`:44-48`).
- `initializeEnvFile($configPath)`: if absent, copy `ROOTPATH/.env.example` or write `"# OSPOS Configuration\n\n"`, then `chmod 0640` (`:56-69`).
- `writeEnvKey($key,$value)`: initialize → lock → read → `applyEnvKeyReplacement` → `atomicWriteFile`, in `finally` unlock (`:78-103`).
- `applyEnvKeyReplacement()` (`:105-122`): regex `/^\s*<key>\s*=.*/m`; replacement `key='value'` with `\` → `\\` and `$` → `\$` escaping; if the key is absent, insert **immediately after** the `encryption.key` line (so the key stays first for backup/rotation), else append. Return `null` only for a regex failure.
- `atomicWriteFile()` (`:133-178`): temp `path.tmp.<16 hex>` opened with mode `x`, chmod 0640, full write + `fflush` + `fsync` when available, `rename` over the target; on Windows fall back to `unlink`+`rename`; final chmod 0640. Any short write returns false and unlinks the temp.
- `backupEnvFile()` (`:187-208`): `mkdir 0750` recursive, copy, `is_readable`, chmod 0640 on both; returns false on any failure.
- `writeNewEncryptionKey()` (`:219-234`): applies the new key then inserts `# encryption.key='<old>' REMOVE IF UNNEEDED\r\n` **before** the new line when an old key exists.
- `envFileIsWritable()` (`:246-271`): requires the **directory** writable (temp+rename semantics), on Windows also the existing `.env`, and a pre-existing lock file writable.

### I.2 Encryption key bootstrap and CI3→CI4 conversion

- `checkEncryption(?CI3SecretConverter $converter = null): bool` (`:296-345`):
  - key `config('Encryption')->key` non-empty and `strlen >= 64` → `true`, no I/O.
  - `.env` not writable → logs critical and throws `RuntimeException(lang('Error.encryption_key_not_provisioned'))`.
  - short non-empty key (CI3-era): `$plain = converter->decryptAll($key)` using AES-128-CBC/HKDF-info `encryption`/`authentication`; then, **inside one `.env` lock**, `rotateEncryptionKeyTransaction($oldKey, conversion)` where conversion = `encryptAll($plain)` → `verifyAll` round-trip compared with `array_diff_assoc($plain, verified) !== []` → throw on mismatch → `saveAll($encrypted)` only when at least one plaintext is non-empty.
  - empty key: `rotateEncryptionKey(null)` (single atomic write under the lock).
- `rotateEncryptionKeyUnlock()` (`:432-473`): `new Encryption(); bin2hex($encryption->createKey())` (CI4 `createKey` = 32 random bytes) → 64 hex chars; initialize env; backup (abort on failure); read; `writeNewEncryptionKey`; `atomicWriteFile`; `config('Encryption')->key = $key`; log. Failure paths throw localized errors.
- `rotateEncryptionKeyTransaction()` (`:503-537`): acquires the mutex, performs the lock-free rotation, runs the conversion callback, removes the backup on success; on any `Throwable` runs `abortEncryptionConversion()` (restores the backup atomically) while still holding the lock, then rethrows; `finally` unlocks. Nested-lock avoidance is explicit (`:490-500`).
- `provisionThrottleKey()` (`:546-591`): reads existing `throttle.key` from `.env` with `/^\s*throttle\.key\s*=\s*['"]?([^'"\r\n]*)/m`; else `bin2hex(random_bytes(32))`; writes atomically; sets `putenv`, `$_ENV`, `$_SERVER`.
- `checkThrottleEncryption()` (`:364-384`): `env('throttle.key')` → `getenv('THROTTLE_KEY')` → provision or throw when `.env` not writable.
- `abortEncryptionConversion()` (`:596-622`) and `removeBackup()` (`:627-635`).

`CI3SecretConverter` (`app/Libraries/CI3SecretConverter.php`): legacy keys list `clcdesq_api_key`, `clcdesq_api_url`, `mailchimp_api_key`, `mailchimp_list_id`, `smtp_pass` (`:32-38`); `decryptAll` uses `Services::encrypter(ci3Config)` with driver `OpenSSL`, digest `SHA512`, cipher `AES-128-CBC`, `rawData=false`, `encryptKeyInfo='encryption'`, `authKeyInfo='authentication'`, no previous keys (`:147-160`); empty values stay empty (`:57-88`); `verifyAll` decrypts CI4 ciphertext; `saveAll` calls `Appconfig::batch_save` and throws `RuntimeException` on failure (`:117-124`); `hasLegacyData` exists but is unused (`:130-139`).

### I.3 CI4 ciphertext format (must be matched/declared incompatible)

From the vendored framework (`/tmp/ospos-src/vendor/codeigniter4/framework/system/Encryption/Handlers/OpenSSLHandler.php:83-160`), with `app/Config/Encryption.php:54-108` (`driver OpenSSL`, `digest SHA512`, `rawData=false`, `cipher AES-256-CTR`, `encryptKeyInfo=''`, `authKeyInfo=''` for normal config):

```
encryptKey = hash_hkdf('SHA512', key, 0, encryptKeyInfo)      // info ''
iv         = random_bytes(openssl_cipher_iv_length('AES-256-CTR')) = 16 bytes
ct         = openssl_encrypt(plain, 'AES-256-CTR', encryptKey, OPENSSL_RAW_DATA, iv)
payload    = base64(iv . ct)
mac        = hash_hmac('SHA512', payload, authKey, false)       // hex, 128 chars
ciphertext = mac . payload
```

Decryption verifies `hash_equals(mac, hash_hmac(...))`, base64-decodes, splits the 16-byte IV, and AES-256-CTR-decrypts. CI3 compatibility uses AES-128-CBC + HKDF info `encryption`/`authentication` (§I.2). **Consequence:** the target's `AES-256-GCM` envelope `ivHex:tagHex:ciphertextHex` derived with `scryptSync(key, "ospos-salt", 32)` (`src/lib/encryption/index.ts:5-60`) is **not** interoperable in either direction. A migrated OSPOS database's encrypted `smtp_pass`/`msg_pwd`/`mailchimp_*` cannot be decrypted by the target, and target-encrypted values cannot be read upstream. Obligations: provide one-time re-encryption on migration (§13 O-S1) or implement CI4-compatible decrypt/encrypt.

Target key handling details: `ensureKey()` accepts only `ENCRYPTION_KEY` (`process.env`), requires length ≥64 **and** `/^[0-9a-f]+$/` (`src/lib/encryption/index.ts:13-34`), generates `randomBytes(32).toString("hex")`, writes `.env` synchronously with `fs.writeFileSync` (no lock, no fsync/rename, no atomicity; backup copied but never used or cleaned), and never re-reads after write except `process.env`. It does not support `encryption.key`, `hex2bin:`/`base64:` prefixes, `ENCRYPTION_KEY` Docker var decoding parity, previous keys, or CI3 short-key rotation. `getConfigDecrypted` decrypts only keys in `ENCRYPTED_KEYS` (from config tabs: `smtp_pass`, `msg_pwd`, `mailchimp_api_key`; **not** `mailchimp_list_id`) (`src/lib/config/index.ts:36-45`; `src/lib/config/tabs.ts:218-220`).

### I.4 CSRF, host-header validation, secure headers

- Upstream CSRF: session-based (`app/Config/Security.php:18`), token name `csrf_ospos_v4` (`:36`), header `X-CSRF-TOKEN` (`:45`), cookie `csrf_cookie_ospos_v4` (`:54`), `tokenRandomize=false` (`:27`), `regenerate=false` (`:74`), redirect-on-failure only in production (`:85`). Global filter is `csrf` with `except => 'login|migrate'` (`app/Config/Filters.php:79-83`); the filter is removed in testing (`:120-132`). Other globals: `honeypot`, `isLoggedIn` (except login|migrate), `invalidchars`; after: `toolbar`, `honeypot`, `secureheaders` (`:79-89`); `throttle` on `login|migrate` (`:116`).
- Upstream host-header guard (GHSA-jchf-7hr6-h4f3): `Config\App::__construct` parses `ALLOWED_HOSTNAMES` or `app.allowedHostnames` (comma-separated, trimmed, empties dropped) (`app/Config/App.php:285-301`); `getValidHost()` throws `RuntimeException` in production when unset, logs and falls back to `localhost` in dev/test, and otherwise returns the host when whitelisted or **substitutes the first configured host** (warning) when not (`:311-357`). `.env.example:8-27` documents the variable. Target `src/proxy.ts:1-35` enforces at request time: production without `ALLOWED_HOSTNAMES` logs FATAL and then refuses every request; loopback hosts always allowed; unlisted hosts get HTTP **403**; non-production without the variable allows everything. Difference: upstream boot-fails in production if unset and rewrites the base URL for unlisted hosts; target continues booting but blocks. Target secure headers: `X-Frame-Options SAMEORIGIN`, `X-Content-Type-Options nosniff`, `Referrer-Policy strict-origin-when-cross-origin`, `Permissions-Policy camera=(), microphone=(), geolocation=()`, HSTS 1 year includeSubDomains (`next.config.ts:6-22`); no CSRF token mechanism for API routes (`/api/items/*` rely on the session cookie only).
- `encode_array`/`decode_array` exact semantics (§3.4 main report): `rawurlencode`/`rawurldecode` per **value**, keys untouched (`locale_helper.php:678-698`), used for the settings cache (`app/Config/OSPOS.php:51,60`).
- `migration_helper.php`: `executeScript()` splits SQL on `;` (drops the trailing element), runs each statement (transaction-aware), logs and returns false on error (`:14-60`); `dropForeignKeyConstraints`/`createPrimaryKey`/`indexExists`/`primaryKeyExists`/`dropAllForeignKeyConstraints` are covered by `tests/Helpers/migration_helperTest.php:20-42`, which asserts a `DatabaseException` propagates from a failing connection for `indexExists`, `primaryKeyExists`, and `dropAllForeignKeyConstraints`. No target equivalents exist.

---

## J. CSV helpers — exact template and parsing contract

### J.1 Template generation

`generate_import_items_csv(array $stock_locations, array $attribute_names): string` (`app/Helpers/importfile_helper.php:8-16`):

- Prefix UTF-8 BOM `pack('CCC', 0xEF, 0xBB, 0xBF)` (`:10`).
- Fixed header line, exactly:
  `Id,Barcode,"Item Name",Category,"Supplier ID","Cost Price","Unit Price","Tax 1 Name","Tax 1 Percent","Tax 2 Name","Tax 2 Percent","Reorder Level",Description,"Allow Alt Description","Item has Serial Number",Image,HSN`
  (`:11`) — note quoting is mixed: `Id`, `Barcode`, `Category`, `Description`, `Image`, `HSN` unquoted; the rest quoted.
- Then `,"location_<name>"` for each stock location in the given order (`:22-31`).
- Then `,"attribute_<definitionName>"` for each attribute name, with key `-1` (the Category pseudo-definition) removed (`:37-47`).
- No trailing newline is emitted by the generator itself (callers/views add it).
- `csvImportHasRequiredItemHeaders(array $rows, array $stock_locations, array $attribute_names): bool` computes the template header line minus the 3-byte BOM, `str_getcsv`s it, and requires `array_diff(required, present) === []`; returns false for empty rows (`:117-129`). This is the import gate invoked at `app/Controllers/Items.php:1149`.

### J.2 Parsing

`get_csv_file(string $file_name): array` (`importfile_helper.php:54-80`):

- `fopen('r')`; on failure returns `false` (return type says `array` — upstream type bug).
- BOM detection: `bom_exists($handle)` reads 3 bytes, rewinds, compares against `EF BB BF`; on true `fseek(3)` (`:86-100`).
- `fgetcsv($handle)` for headers; rows combined with `array_combine($headers, $row)`; rows equal to `[null]` (blank line) skipped (`:68-74`).
- No encoding conversion, no delimiter/quote configuration, no line-length limit (`fgetcsv` default), no duplicate/extra-column handling: a row with more fields than headers makes `array_combine` fail (warning/false) and a row with fewer returns false.
- Returns `array_combine` rows keyed by the raw header strings (BOM already stripped).

### J.3 Import row semantics (upstream `Items::postImport`, `app/Controllers/Items.php:1140-1270`)

- Whole file in **one DB transaction**; any failed row triggers `transRollback()` and `Items.csv_import_partially_failed` with the failed row numbers (`:1260-1268`). Row number reported is `array key + 2` (`:1231`).
- `Id` > 0 → update (must exist); else insert (`:1171-1174`; existence check `:1345-1352`).
- Required for new rows: `Item Name`, `Category`, `Unit Price` non-empty (`:1336-1348`); `Cost Price` empty → `0` for new rows only (`:1349-1350`).
- Numeric validation: `Cost Price`, `Unit Price`, `Reorder Level`, `Supplier ID`, `Tax 1/2 Percent`, and every `location_<name>` (`:1355-1373`).
- `Supplier ID` must exist or becomes `null` (`:1187-1189`).
- `Barcode` → `item_number`, with uniqueness enforced via `item_number_exists` (honours `allow_duplicate_barcodes`) (`:1199-1202`).
- Barcode charset restricted by CI4 `FormatRules::alpha_numeric_punct` (`:1377-1385`).
- `Allow Alt Description` / `Item has Serial Number`: empty → `null` on update, `'0'`/`'1'` on insert (`:1191-1197`); in the target these are parsed as `1|true` (case-insensitive) (`src/app/api/items/csv-import/route.ts:56-57`).
- Stock-location columns: names must be in the allowed location list (`:1292-1309`); the cell value is validated numeric; `save_inventory_quantities` writes the quantity and inserts an inventory row with `trans_inventory = <value>` (not the delta) for each provided column; on updates absent columns are skipped, on inserts absent columns write 0 (`:1435-1470`). Target instead computes `delta = newQty - oldQty` and logs the delta (`src/app/api/items/csv-import/route.ts:92-123`) — different inventory ledger semantics.
- Attributes: `attribute_<name>` columns; `_DELETE_` (case-insensitive) removes links (`:1396-1398`); DROPDOWN values must be in the definition's value list; DECIMAL must be numeric; DATE must satisfy `isValidDate()` (config date format) (`:1400-1427`). Target does no dropdown/date/type validation and writes DATE raw / DECIMAL via `parseFloat` (`csv-import/route.ts:144-171`).
- `Tax 1/2 Percent` < 0 fails (`:1483-1485`); a tax row is inserted only when the percent is numeric, ≥0, and the name is non-empty (`:1487-1494`).
- `Image` is stored as `pic_filename` (`:1184`) — no file existence check. Target ignores the `Image` column entirely.
- After import, `deleteOrphanedValues()` runs on success (`:1263`).

### J.4 Target CSV defects (verified)

- `src/app/api/items/csv-template/route.ts` emits `"﻿" + headers.map(h => '"'+h+'"').join(",") + "\n"` (`:22`): every header quoted (upstream mixes) and a trailing newline. Header order/names match the fixed list plus `location_`/`attribute_` (`:14-20`). No `category` pseudo-attribute exclusion logic beyond querying non-deleted definitions.
- `parseCsv()` (`src/lib/csv/parse.ts:1-24`) does **not** strip a BOM. Parsing the app's own template therefore keys the first header as `"﻿Id"`, so `obj["Id"]` is undefined, every row is treated as an insert, and `Id`-based updates never work. It also does not implement `array_combine` length checks, so short rows silently fill `""` (`csv-import/route.ts:34-35`).
- No required-header gate equivalent to `csvImportHasRequiredItemHeaders`; a file with renamed columns imports with empty values.
- Per-row transaction instead of whole-file transaction (`csv-import/route.ts:38-179`) → partial imports persist on later failure; the response reports `{success,failed,errors[:50]}` rather than a localized rollback message.
- `itemNumberExists` in the target ignores `allow_duplicate_barcodes` (`src/lib/items/repository.ts:429-436`), unlike upstream `Item::item_number_exists` (`app/Models/Item.php:92-107`).
- Prices parsed with `parseFloat` (dot only, no locale/`parse_decimals`) (`:42-44`); dates/decimals unvalidated; `_DELETE_` handling deletes **all** attribute links for the item rather than only that definition (`:129-131`).
- No BOM output test exists; the barcode/CSV e2e only covers the template download (`e2e/items-barcodes.spec.ts` covers barcodes; no CSV import e2e).

---

## K. Tax / attribute / URL / report helpers

- `app/Helpers/tax_helper.php` builds table headers and data rows only: `get_tax_code_table_headers()` (`:12-22`), `get_tax_code_data_row()` (`:27-47`), `get_tax_categories_table_headers()`/`data_row` (`:52-85`), `get_tax_jurisdictions_*` (`:90-122`), `get_tax_rates_manage_table_headers()` (`:127-139`), `get_tax_rates_data_row()` (`:144-167`). `transform_headers()` is from `tabular_helper.php:32` (default `readonly=false`, `editable=true`). Edit links are CI4 `anchor()`s with `class="modal-dlg"`, `data-btn-submit=lang('Common.submit')`, title `lang('Taxes.update…')`. `Rounding_mode::get_rounding_code_name()` renders the rounding label (`:156`). No calculation logic here (that lives in `Tax_lib`).
- `app/Helpers/attribute_helper.php`: `getAttributeDataType($type)` maps `DATE→'attribute_date'`, `DECIMAL→'attribute_decimal'`, everything else (TEXT, DROPDOWN, CHECKBOX, GROUP, unknown) → `'attribute_value'` (`:12-20`); `validateAttributeValueType()` allows only `['attribute_value','attribute_decimal','attribute_date']` and throws `InvalidArgumentException('Invalid data type')` otherwise (`:28-35`). Constants `DATE`, `DECIMAL`, `TEXT`, `CHECKBOX`, `GROUP`, `DROPDOWN` are in `app/Config/Constants.php` (`:90-101` area). Target has no equivalents (attribute repository hard-codes `attributeValue`/`attributeDate`/`attributeDecimal` at call sites; `grep` for `getAttributeDataType` returns nothing).
- `app/Helpers/url_helper.php`: `base64url_encode()` = `rtrim(strtr(base64_encode($data), '+/', '-_'), '=')` (`:10-13`); `base64url_decode()` re-pads to a multiple of 4 and reverses the alphabet (`:23-30`). Both are guarded by `function_exists`. Used for payment ids in URLs (`app/Views/sales/register.php:529` `anchor("$controller_name/deletePayment/".esc(base64url_encode($payment_id),'url'))`). The target has no base64url helper (`grep` returns nothing) and no deletePayment URL encoding.
- `app/Helpers/report_helper.php`: `get_report_link($report_name, $prefix='', $lang_key='')` returns `['path'=>site_url('reports/[prefix_]name'), 'label'=>lang($lang_key ?: 'Reports.'.$name)]`, stripping a `reports_` prefix (`:9-30`); `can_show_report($permission_id, $restrict_views=[])` returns false unless the id contains `reports_` and contains none of the restricted substrings (`:38-51`).
- `app/Helpers/sale_helper.php` is **empty (0 bytes)** — a placeholder file.
- `app/Helpers/migration_helper.php` contracts summarised in §I.4; `executeScript` is called by the migration runner and is not covered by the cited test.
- `app/Helpers/dompdf_helper.php` exact semantics are in the master report §3.6; the verified details are: options `isRemoteEnabled=false`, `isPhpEnabled=false` (`:11-14`); the `str_replace(['\n','\r'],'')` removes literal backslash sequences only (`:15`); `stream($filename.'.pdf')` sends the PDF as a download by default and returns nothing, `output()` returns the bytes (`:18-24`).

---

## L. Target gap analysis — residual items not in the master report at this granularity

Legend: **U** = upstream contract, **T** = target state, **O** = obligation id in §M.

| # | Surface | U | T | O |
|---|---|---|---|---|
| L1 | `render()` unknown tokens | `''`, `{X:n}` → n zeros (`Token_lib.php:233-242`) | code echoed (`src/lib/token/index.ts:155-156`) | T-01 |
| L2 | `render()` scan grammar | any non-space/non-brace/non-colon ID, any-width (`:148-156`) | `[A-Z]{2,4}` + `\d+` (`src/lib/token/index.ts:6`) | T-01 |
| L3 | Sequence token repeated | one resolve, one increment (`:217-231`) | one resolve per regex match; duplicates increment repeatedly (`:17-25,116-121`) | T-01 |
| L4 | `save=false` | preview does not persist (`Appconfig.php:147-160`) | `ctx.save` never consulted (`src/lib/token/index.ts:116-121`) | T-01 |
| L5 | `QCO` | token `QCO` (`Token_year_quote_count.php:18-21`) | `YQO` (`src/lib/token/index.ts:131`), `TOKEN_CODES` misses `QCO` | T-01 |
| L6 | `SCO` predicate | invoice_number NOT NULL + status 1 (`Sale.php:1330-1337`) | status 1 only (`src/lib/token/index.ts:140-147`) | T-01 |
| L7 | `YCO`/`YQO` | count (no +1) (`Sale.php:396-410`) | count + 1 (`:129,138`) | T-01 |
| L8 | `CU` | `Sale_lib` customer, `''` when info supplied (`Token_customer.php:38-52`) | `ctx.customerId` lookup (`:148-154`) | T-01 |
| L9 | Date directives | `%`-based, exact ICU outputs (§B) | brace-based, no `%`, wrong map, prefix-matching regex; `datefmt` unused (`:7,29-60`) | T-01/O-D1 |
| L10 | barcode input formats | JSON array of pattern strings, regex built from `{I}/{W}/{P}` + widths (`Token_lib.php:169-215`) | JSON array of `{name,value}` objects, raw regex (`src/lib/token/index.ts:72-99`) | T-01 |
| L11 | parse semantics | gram→qty, `I` item, `P` price, last-format bleed (`:176-182`) | no `W/P/I`, heuristic `KIT|POS`/digits (`:101-106`) | T-01 |
| L12 | number formatting | `NumberFormatter` + `to_*` + tax-included rule (`locale_helper.php:435-452,388-397`) | `toFixed(2)` everywhere (§3.5 main) | T-08 |
| L13 | barcode type keys | uppercase Picqer codes, case-insensitive dispatch; 32 entries with labels (`Barcode_lib.php:19-52`) | same 32 keys but config select stores lowercase; `?? "code128"` fallback | T-02 |
| L14 | barcode checksums/forced sets | distinct Picqer types | collapsed bcid map (`src/lib/barcode/index.tsx:4-14`) | T-02 |
| L15 | barcode value content | `id`/`number` (any non-id) incl. name fallback | `id/item_number/name`, `number` unrecognised (`:71-75`) | T-02 |
| L16 | barcode labels | prefixes + `to_currency` + company_name + 40-char limiter (`Barcode_lib.php:167-189`) | raw values, no company_name, no limiter (`:92-128`) | T-02 |
| L17 | receipt barcode | SVG Code128, width 2, height 30, no text (`:126-135`) | SVG/PNG Code128 with text, width 1 (`:67-69,54-64`) | T-02 |
| L18 | document totals | `get_totals` incl. tax-included, cash rounding, discount | `sum(unitPrice*qty)` + `paid-total` (`src/lib/pdf/data.ts:22-23,39`) | T-03/T-04 |
| L19 | document line fields | name+attributes/description/serial/HSN/taxed flag/print filter/reverse for receivings (§E.5) | description only, no print filter, no attributes/HSN/flag (`data.ts:31-35`) | T-03/T-04 |
| L20 | document template selection | `receipt_template`, `invoice_type` whitelists (`Sales.php:1289-1299`) | always `ReceiptDocument` for receipt; invoice PDF route renders `ReceiptDocument` (`invoice/[id]/pdf/route.tsx:3,12`); invoice page ignores `invoice_type` | T-04 |
| L21 | missing HTML pages | quote/work_order/tax_invoice views | only PDF routes exist; completing a quote/work-order redirects to `/sales/quote|work_order/<id>` which 404s (`src/app/(secure)/sales/actions.ts:204-206`) | T-04 |
| L22 | config flags used by documents | `receipt_show_*`, `receipt_font_size`, `receipt_show_tax_ind`, `receipt_show_company_name`, `include_hsn`, comments, return policy, payment message, logo | none read by renderers; only `return_policy` on the invoice page (`invoice/[id]/page.tsx:79`) | T-03/T-04 |
| L23 | print pipeline | jsPrintSetup/`window.print`, margins, silent print, printer localStorage, delay + auto-return, `.print_hide` CSS | absent (no `window.print`, no print CSS) | T-06 |
| L24 | PDF engine | Dompdf local-only, PHP disabled, temp file + email attachment | react-pdf; no temp files; attachments built from wrong data (`src/lib/email/index.tsx:94-108`) | T-05 |
| L25 | email templates | per-type HTML + token body + base64 logo + localized subject + PDF attachment | generic HTML, hard-coded English subject, `cid:` logo with missing `public/uploads`, dead `email-action.tsx` | T-05/T-07 |
| L26 | email/SMS config | protocol mail/sendmail/smtp, port default 465, crypto ssl, encrypted secrets | SMTP only, port default 587, crypto tls, `saveMessageAction("sms")` throws, `mailchimp_list_id` plaintext | T-07 |
| L27 | Mailchimp runtime | (inert upstream due to constructor bug) customer subscribe/unsubscribe/profile activity | lib only, no integration, payload differences | T-07 |
| L28 | SMS | configured-stub returns true, no request | live Twilio call (§G) | T-07 |
| L29 | encryption | CI4 AES-256-CTR + HKDF-SHA512 HMAC envelope; CI3 AES-128-CBC conversion; atomic locked `.env` rotation | AES-256-GCM + scrypt; non-atomic `.env`; no conversion; different key names/prefixes (§I) | O-S1 |
| L30 | CSV template | mixed quoting, no trailing newline, BOM, category pseudo-attribute excluded | all quoted + trailing newline; BOM stripping absent on import → `Id` column ignored | T-09 |
| L31 | CSV import | whole-file transaction, header gate, duplicate-barcode policy, date/decimal/dropdown validation, inventory absolute semantics | per-row transaction, no header gate, no duplicate policy, no validation, inventory delta semantics | T-09 |
| L32 | i18n | `lang()` for every label; 45 locales in `get_languages()` (`locale_helper.php:52-104`) | `locales = ["en"]` (`src/lib/i18n/index.ts:4`); every `src/messages/*/common.json` inspected is `{}` (en, fr verified); all document labels hard-coded English | O-L1 |
| L33 | MySQL | CI4 MySQL only | `getDbSync()` throws when `DB_DRIVER=mysql` (`src/lib/db/index.ts:32-37`) and every token/barcode/PDF/email/mailchimp path uses it | O-M1 |
| L34 | permissions | `reports_sales` for receipt/invoice/sendPdf/sendReceipt (`Sales.php:1439-1444`, `:1451-1456`, `:1044-1048`, `:1101-1108`) | `requirePermission("sales")` on pages/PDFs (`receipt/[id]/page.tsx:10`, `invoice/[id]/page.tsx:10`, all PDF routes); `sendPdfAction` has no permission check (`actions.ts:217-220`) | O-P1 |
| L35 | target tests | suites listed in §N | no token/barcode/locale/csv/encryption tests exist; only `rbac`, `items/repository`, `sale-lib`, `tax` unit tests (`find src -name '*.test.ts'`) | §N |

Additional target facts:

- `src/lib/pdf/receipt_default.tsx` is a near-exact duplicate of `src/lib/pdf/receipt.tsx` (same styles/data/maths, `:4-58` vs `:17-71`), while `receipt_short.tsx` omits taxes entirely and truncates descriptions to 24 chars (`:18-23`). None of the three reads `receipt_template`.
- `src/lib/pdf/data.ts` defaults customer to the literal `"Walk-in"` (`:15`), whereas upstream prints no customer line when none is set (`receipt_default.php:39-41`); target pages print `Customer: Walk-in` unconditionally.
- `src/lib/pdf/invoice.tsx` labels the document `INVOICE` hard-coded and numbers it with `data.saleId`, not `invoiceNumber` (`:30-32`); the HTML invoice page does use `sale.invoiceNumber ?? sale.saleId` (`invoice/[id]/page.tsx:39`). Quote/work-order PDFs likewise use `saleId` instead of `quote_number`/`work_order_number` (`quote.tsx:32`, `work_order.tsx:33`).
- `src/lib/pdf/tax_invoice.tsx` prints an em-dash for HSN unconditionally (`:51`) and has no HSN data field at all.
- `src/app/(secure)/sales/receipt/[id]/page.tsx` computes `total` as `unitPrice*qty` and `change` as `paid-total` (`:26-27,58`), prints taxes/payments without ordering or gift-card handling, and offers no print/email controls.
- `src/app/(secure)/sales/email-action.tsx` is a correct builder but dead; `pickDoc` includes `receipt_default` (`:17-26`), yet nothing references the exported actions (`grep`).
- `src/app/(secure)/receivings/receipt/[id]/page.tsx` is a simplified HTML receipt with no barcode, no payment type/tendered/change, no return policy, no print (`:24-50`).
- `src/components/sales/register.tsx` has no print-after-sale checkbox and no price-work-orders checkbox (`grep` for `printAfterSale` shows only `cart-store.ts:59`); `isPrintAfterSale`/`isEmailReceipt` test the wrong config keys (`src/lib/sale/sale-lib.ts:273-286`: `print_receipt_check_behaviour === "1"` though values are `always|never|last`), so `never` cannot disable and `always` cannot force.
- `src/db/seed.ts:40-51` supplies barcode defaults that differ from upstream (`barcode_first_row=name` vs `category`, `second=category` vs `item_code`, `third=cost_price` vs `unit_price`, page width 150 vs 100, cellspacing 5 vs 20, generate-if-empty 1 vs 0); the master report's list of missing keys (§1.10) is the authoritative gap list.

---

## M. Residual implementation obligations (appendix to the master's T-01…T-09)

Ordered; each is additive to the master's obligations.

- **O-D1 — Date directive engine.** Replace the brace-directive implementation with `%` expansion. Required contract: special-case `%%`→`%`, `%n`→LF, `%t`→TAB, `%C`→2-digit century, `%c`→`yyyy-MM-dd HH:mm:ss`, `%x`→`yyyy-MM-dd`; map the 27 table entries to ICU patterns exactly as §B; leave `%l` and unknown letters literal; localise digits/text by the server/ICU default locale (or a configured locale if the product decides to fix locality — document the deviation); timezone from the `timezone` setting. Files: `src/lib/token/index.ts` (+ new tests). Fixtures: §B en/other-locale table.
- **O-D2 — PHP-date formatting for documents.** Provide `toDate`/`toDateTime` equivalents using the configured `dateformat`/`timeformat` (PHP token semantics, not ICU), used by receipt/invoice data builders; add `isValidDate` for CSV attribute DATE validation. Files: new `src/lib/i18n`/`format` module; `src/lib/pdf/data.ts`.
- **O-F1 — Locale money/quantity formatting.** Implement `toDecimals/toCurrency/toCurrencyTax/toQuantityDecimals/toTaxDecimals/parseDecimals` with `Intl.NumberFormat`/a locale library, reproducing §C outputs, including: default-2-decimals when no key, `tax_included` switch, empty/null behaviours, grouping always-on (unless product fix), currency-symbol side detection, `parse_decimals` empties returning the original string, `MAX_PRECISION=1e14` false, and locale decimal separators. Wire every document cell and register summary through it. Files: new `src/lib/format/*`, `src/lib/pdf/*`, `receipt`/`invoice`/`receivings` pages, `src/components/sales/register.tsx`.
- **O-T1 additions — Token/parse parity.** Unknown token removal (`''`), arbitrary-length width padding zeros, one-resolve-per-ID, `save` flag, `QCO` id, `SCO` predicate, `YCO/QCO` count-without-+1, `CU` semantics, upstream count/sequence queries on both SQLite and MySQL (`getDb()` not `getDbSync()`), and barcode-format parsing per §A.6 (pattern strings + `{I}/{W}/{P}` + gram quantity + last-format bleed decision). Add `barcode_formats` handling to config.
- **O-B1 — Barcode parity.** Preserve uppercase Picqer codes in config; dispatch case-insensitively; implement checksum/extended/forced-code-set options in bwip-js (or reject unsupported codes explicitly); no text by default; label prefixes + currency + company row + 40-char limiter; SVG width/height semantics (width px CSS, height px) and receipt barcode exact parameters; no-op `generate_if_empty` unless decided; error surfacing.
- **O-DOC1 — Document data builder.** One `buildDocumentData(saleId)` that copies the sale into a document cart (joins items/attributes, recomputes totals/taxes with the same functions used at sale time, orders taxes by `print_sequence`, handles cash rounding/amount_due/amount_change, customer/company info with account/tax ids, employee initials, barcode SVG, invoice/quote/work-order numbers, comments, gift-card remainder, print filter, line-sequence sort). Contract fields: §E.5.
- **O-DOC2 — Template set.** Six renderers (receipt_default, receipt_short, invoice, tax_invoice, quote, work_order) and four email variants with the exact fields/labels/flags in the master §3 and §E. Implement `receipt_template` and `invoice_type` selection (with custom templates documented as extension points or explicit 404), print-price suppression for work orders, and the documented upstream defects either faithfully (with snapshots) or as explicit fixes listed in the report.
- **O-DOC3 — Pages and routes.** Add HTML pages for quote/work-order/tax_invoice or redirect to PDF; fix `/sales/invoice/[id]/pdf` to render `InvoiceDocument` (or `TaxInvoiceDocument` per `invoice_type`); use document numbers (invoice/quote/WO) in PDFs; add print button/browser print + optional jsPrintSetup-equivalent features (margins, silent, printer selection, auto-return delay) or document their omission; add email buttons wired to the correct server action.
- **O-E1 — Email parity.** SMTP/mail/sendmail protocol handling, port/crypto defaults (465/ssl), base64 logo embedding, per-type HTML bodies with token-rendered `invoice_email_message`, localized subjects/messages, PDF attachment, success/failure messages, `reports_sales` gate, cleanup of temp files. Decide on SMTP password decryption failure behaviour.
- **O-S1 — Encryption interop.** Either (a) implement CI4-compatible decrypt/encrypt (AES-256-CTR, HKDF-SHA512 info `''`, HMAC-SHA512 hex prefix, base64(iv||ct); AES-128-CBC/HKDF `encryption`/`authentication` for CI3 legacy) plus a migration re-encrypt step, or (b) add a one-time conversion command that reads legacy ciphertext with a CI4-compatible decryptor and rewrites target envelopes. Support `ENCRYPTION_KEY`/`encryption.key`, `hex2bin:`/`base64:` prefixes, ≥64-char validation, lock+backup+atomic rotate, previous-keys fallback. Mark `mailchimp_list_id` encrypted.
- **O-C1 — CSV parity.** Emit the exact mixed-quoted header with BOM and no trailing newline; strip BOM on import; add `csvImportHasRequiredItemHeaders`; whole-file transaction; duplicate-barcode policy; numeric/date/dropdown validation; `_DELETE_` per definition; absolute inventory semantics; `Image` handling; locale decimal parsing.
- **O-H1 — Helpers.** Port `base64url_encode/decode`, `getAttributeDataType`/`validateAttributeValueType` (or equivalent central mapping), `encode_array`/`decode_array` if a serialised config cache is introduced, report link/permission helpers, and the migration helper failure semantics (`DatabaseException` propagation).
- **O-L1 — Localization.** Populate message catalogues for document labels and all `lang()` surfaces; wire `language_code`/employee language; ensure date/number formatting uses the same locale policy as the labels.
- **O-M1 — DB portability.** Remove `getDbSync()` from document/token/barcode/email/mailchimp paths or provide a synchronous MySQL adapter; otherwise all these features are SQLite-only.
- **O-P1 — Authorization.** Apply the upstream gates: `sales` module for the controller plus `reports_sales` for receipt/invoice/sendPdf/sendReceipt; validate the `type` union at runtime in `sendPdfAction`; never trust client-supplied `kind`.
- **O-CFG1 — Config tabs.** Add the missing keys and fix the SMS tab key (`"sms"` → `"message"`), missing receipt/invoice/barcode/email keys, `mailchimp_list_id` encryption, and the barcode select values (uppercase Picqer codes, `number` content).

---

## N. Acceptance tests (mapped to the upstream suites)

Upstream files and what each pins — use these names/assertions as the template for target Vitest suites (suggested target paths in parentheses):

1. **`tests/Libraries/Token_libTest.php` → `src/lib/token/index.test.ts`**
   - no-token pass-through, `%`-only, `100%%`→`100%`, `%%`→`%`, unclosed/unopened braces (`:18-45,110-136`).
   - scan: `{customer}`, `{invoice:10}` tree shape, empty (`:90-108`).
   - strftime: `%Y` 4 digits, `%m`/`%d` 2 digits, `%F`/`%D`/`%T`/`%R`/`%C`/`%c`/`%x` exact shapes, `%n` LF, `%t` TAB, `%h` 3 letters, `%q` literal, `%z` non-empty, `%A`/`%B` non-literal (`:138-313`).
   - Add exact-fixture tests from §A/§B (fixed Date injection or fake clock): `{CO}`, `{ISEQ:6}`, `{FOO:3}`→`000`, `{CU}`, repeated-sequence single increment, unknown `QCO` id.
   - Add `parse_barcode` fixtures §A.6 (7 cases + multi-format bleed).
2. **`tests/Libraries/Barcode_libTest.php` → `src/lib/barcode/index.test.ts`**
   - XSS escaping of `name`, `item_code` (id and number paths), `category`, `company_name`; clean name unaffected (`:40-125`).
   - Add: 32-code list equality and labels; `barcode_content=number` with empty `item_number`; `not_show` → empty; `unit_price` → `to_currency` label; missing item fields → English error string; case-insensitive type dispatch; sheet row breaking at N%; PDF label prefix/currency.
3. **`tests/Helpers/LocaleHelperTest.php` → `src/lib/format/locale.test.ts`**
   - `isValidDate`: valid, wrong format, impossible date, Feb-30 overflow, empty, leap day valid/invalid, partial (`:20-59`).
   - Extend with §C fixtures: `to_currency`/`to_currency_tax`/`to_decimals` defaults, empty/null, `parse_decimals` empties and `MAX_PRECISION`, grouping behaviour, symbol side per locale, exact en/de/fr strings.
4. **`tests/Helpers/UrlHelperTest.php` → `src/lib/util/url.test.ts`** — encode is URL-safe and round-trips (`:15-26`); add padding cases (`""`, length%4 = 1/2/3) and non-ASCII.
5. **`tests/Config/EncryptionTest.php` → `src/lib/encryption/config.test.ts`** — precedence cascade skipping empty sources; `hex2bin:`/`base64:` decoding; all-empty → `''` (`:14-53`). Add target: key length/hex validation, env write atomicity, `ENCRYPTION_KEY` vs `encryption.key`, CI4 envelope decrypt fixture (fixed key/iv vector), CI3 AES-128-CBC legacy decrypt fixture.
6. **`tests/Helpers/security_helperTest.php` → `src/lib/security/env.test.ts`** — 32 tests: replacement/insert-after-encryption/append/escape patterns; disk writes; atomic temp cleanup; writability (dir, lock, Windows); `checkEncryption` valid/empty/short-CI3/rollback-on-save-failure; throttle fallback/preference/provision/idempotency; rotate persists/old-key comment/no backup/error on directory; abort restore/error; remove backup (`:212-670`).
7. **`tests/Helpers/migration_helperTest.php` → `src/lib/db/migration-helper.test.ts`** — failing connection propagates `DatabaseException` for index/PK/FK helpers (`:20-42`).
8. **Add** `src/lib/csv/parse.test.ts`: BOM strip (target currently fails), quoted commas/newlines/escaped quotes, CRLF, blank rows, ragged rows, template header exact bytes (`﻿Id,Barcode,"Item Name",…`), round-trip import of the target's own template updating by `Id`.
9. **Add** `src/lib/pdf/data.test.ts`: fixture sale with 2 lines (one discounted percent, one serialized), 2 tax groups, payment Cash + Gift Card, cash rounding on/off; assert subtotal/prediscount/discount/total/amount_due/amount_change, tax ordering, line fields, customer/company info strings, barcode presence, print filter, and exact money strings per locale.
10. **Add** document snapshot tests for all ten templates/email variants using the §5/§E contracts, including the upstream-defect cases (`tax_invoice` barcode source, work-order email subtotal/taxes, `receipt_show_tax_ind`, `receipt_show_total_discount` on/off, no-payments invoice, gift-card remainder, return sale negatives).
11. **Add** email tests with a transport fake: configuration mapping (protocol/port/crypto/timeout), decrypted password use, attachment filename/content-type, sender name/address, subject per type and number, localized success/failure messages, missing customer email, `reports_sales` 403, temp-file cleanup.
12. **Add** Mailchimp tests with a fetch fake: datacenter extraction, method/URL per operation, md5 lowercase hash, payloads (`status`, `status_if_new`, `merge_fields`), 4xx surfacing, and (decision) upstream-inert behaviour vs target live integration.
13. **Add** SMS tests: all five parameters required, password decryption, message URL-encoding, transport outcome mapping (if Twilio is kept) or stub `true` (if upstream parity is chosen).
14. **E2E additions** (`e2e/sales.spec.ts`, `e2e/items-barcodes.spec.ts`): print button triggers `window.print` stub; receipt/invoice PDF downloads non-empty and contain the sale id/number; email action button calls the action and reports success/failure; barcode PDF with selected ids contains exactly those items; CSV template download byte-prefix is `EF BB BF` and import of that file updates the same item.

---

## O. Unknowns

1. **Official `barcode_formats` examples.** No canonical example exists in the repository, docs, or tests. The parser contract is unambiguous (§1.9), but a migration fixture must be chosen by product (e.g. `["{I:4}{W:4}{P:3}"]`). Marked unknown for exact legacy data.
2. **bwip-js bcid acceptance.** `node_modules` is absent; whether `pharmacode2`, `rms4cc`, `imb`, `std25`, `int25`, `ean2`, `ean5`, `code32`, and the checksum/forced-set options exist in `bwip-js@4.11.1` could not be executed. Verify before O-B1.
3. **ICU default locale/digits in the upstream deployment.** `applyDateFormats` uses `IntlDateFormatter(null, …)` (`Token_lib.php:83-90`); the served locale depends on the host's `intl.default_locale`/ICU defaults, not on OSPOS config. The exact rendered date tokens vary by deployment (en_US assumed for fixtures). Decide and document the target policy.
4. **Dompdf defaults.** Whether relative image paths in `quote_email`/`work_order_email` render in the upstream PDF depends on the Dompdf `chroot`/base-path configuration, which is not overridden here (`dompdf_helper.php:11-15`). Not executed.
5. **`custom_invoice`/`custom_tax_invoice` intent.** Whether these are user-supplied templates or abandoned stubs is not stated; no view files ship.
6. **Mailchimp upstream intent.** The connector's `$this->config` bug makes runtime sync inert; whether the port should reproduce inertness or fulfil the intended integration is a product decision.
7. **SMS gateway choice.** Upstream is a documented stub requesting a proxy; target chose Twilio. Which contract is authoritative is a product decision.
8. **`print_silently` inversion and `thousands_separator` no-op.** Upstream code contradicts the UI labels; whether to fix or preserve is a product decision (this report recommends explicit fixtures either way).
9. **MySQL parity.** All audited target paths call `getDbSync()` which throws under `DB_DRIVER=mysql` (`src/lib/db/index.ts:32-37`); whether MySQL is in scope for these features is not stated in the repository.
10. **Employee-language i18n.** Upstream `current_language()` prefers the logged-in employee's language (`locale_helper.php:32-47`); the target i18n reads only the system `language_code` and supports only `en` (`src/lib/i18n/index.ts:4-13`). Whether per-employee languages are required is unstated.


