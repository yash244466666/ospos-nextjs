# 10 — Receipts, tokens, barcodes, email/SMS, and formatting helpers

Analysis of upstream OSPOS 3.4.3 at commit
`603b2c7c8fd5f3b2d64a3730e0f7ea38c82872ea` and the target
`/home/yash/Desktop/yash/ospos-nextjs`.

**Status:** This report was completed by the main analysis after the dedicated receipts
agent exceeded the concurrency window. The dedicated agent's verified supplement
(`10-receipts-tokens-barcode-email.supplement.md`) is **normative** and adds exact fixtures,
ICU output, cipher contracts, and residual obligations. Read the supplement first for
token/barcode/email edge cases. The sales report (`01-sales.md` §6) covers the
document-rendering matrix in additional depth.

---

## 1. Token engine (`app/Libraries/Token_lib.php`, `app/Models/Tokens/*`)

### 1.1 `render()` pipeline

`render(string $tokened_text, array $tokens = [], bool $save = true): string`
(`Token_lib.php:62-79`):

1. If the text contains `%`, call `applyDateFormats()` first.
2. `scan()` the text for `{...}` token occurrences.
3. If none, return the text unchanged.
4. `generate()` resolves each token code/length and builds parallel replace/value arrays.
5. `str_replace()` replaces **every** occurrence of each literal token spec.

Consequences:
- `%` strftime expansion runs before token substitution.
- A token appearing twice is replaced both times (the token tree groups by code and
  length; `generate()` iterates every length spec).
- Unknown tokens resolve to `''` (`resolve_token` returns `''` if no token matches);
  the literal `{XYZ}` is replaced with empty text.
- `$CO`-style legacy formats are **not** tokens; the default invoice format `$CO`
  renders literally. Operators must configure `{CO}`/`{ISEQ}` forms.

### 1.2 `scan()` grammar

Regex (`Token_lib.php:146-167`):

```
\{ ([^\s\{\}:]+) (?: : ([^\s\{\}:]+) )? \}
```

- Token code: any run without whitespace, `{`, `}`, `:`.
- Optional `:length` uses the same character class (arbitrary string, not just digits).
- The tree is `token => [length => literal]`; repeated tokens with different lengths are
  stored separately.

### 1.3 Token classes

| Code | Class | Value | Cite |
|---|---|---|---|
| `CU` | `Token_customer` | current session customer's `first_name . ' ' . last_name`, trimmed; constructor `$customer_info` is accepted but only used when non-empty? (it checks `empty($this->customer_info)` and otherwise returns `''`) | `Token_customer.php:18-51` |
| `CO` | `Token_invoice_count` | `Sale::get_invoice_count()` = count of rows with `invoice_number IS NOT NULL` (all statuses); constructor value ignored because `get_value()` uses a local `$value` that is never set | `Token_invoice_count.php:15-41`; `Sale.php:357-363` |
| `ISEQ` | `Token_invoice_sequence` | if constructed with a non-empty value → that value; else `Appconfig::acquire_next_invoice_sequence($save)` | `Token_invoice_sequence.php:17-44` |
| `QSEQ` | `Token_quote_sequence` | `Appconfig::acquire_next_quote_sequence($save)` (no constructor value) | `Token_quote_sequence.php:13-35` |
| `WSEQ` | `Token_work_order_sequence` | constructor value if non-empty, else `acquire_next_work_order_sequence($save)` | `Token_work_order_sequence.php:17-44` |
| `SCO` | `Token_suspended_invoice_count` | `Sale::get_suspended_invoice_count()` = count of suspended rows with `invoice_number IS NOT NULL` | `Token_suspended_invoice_count.php:12-30`; `Sale.php:1330-1338` |
| `YCO` | `Token_year_invoice_count` | `Sale::get_invoice_number_for_year()` = count of invoice rows in current year + `start_from` (default 0; no +1) | `Token_year_invoice_count.php:12-31`; `Sale.php:381-410` |
| `QCO` | `Token_year_quote_count` | `Sale::get_quote_number_for_year()` = count of quote rows in current year + `start_from` | `Token_year_quote_count.php:12-31`; `Sale.php:391-410` |

`Token::get_tokens()` (`Token.php:35-48`) registers `CU`, `CO`, `ISEQ`, `QSEQ`, `SCO`,
`QSEQ` again (duplicate), `WSEQ`, `YCO`, `QCO`. There is no `YQO`.

`Token::get_barcode_tokens()` (`Token.php:22-31`) registers `Token_barcode_price` (`P`),
`Token_barcode_weight` (`W`), `Token_barcode_ean` (`I`).

### 1.4 Barcode token regexes

| Token | `get_value()` | Meaning |
|---|---|---|
| `P` | `\d` | price digits |
| `W` | `\d` | weight digits |
| `I` | `\w` | item id/number |

These are regex fragments used by `parse()`, not values.

### 1.5 `parse()` and `parse_barcode()`

`parse(string $string, string $pattern, array $tokens = []): array`
(`Token_lib.php:188-215`):

1. Scan the pattern for `{TOKEN:length}`.
2. For each found token, find its token object and replace the literal with
   `({value}{length})`, e.g. `(\d{4})`.
3. Run `preg_match("/$pattern/", $string, $matches)`.
4. Map each found token to its capture group by order.

`parse_barcode(?string &$quantity, ?string &$price, ?string &$item_id_or_number_or_item_kit_or_receipt)`
(`Token_lib.php:169-186`):

1. Read `barcode_formats` JSON.
2. For each format (in order), `parse()` the scanned input with the barcode tokens.
3. `quantity = isset(W) ? (int)W / 1000 : 1`.
4. `item = isset(I) ? I : original input`.
5. `price = isset(P) ? (float)P : null`.
6. **No break**: the last matching format wins for each field; a later format that does
   not match leaves the earlier values intact because the assignments are conditional.

Empty/invalid `barcode_formats` → `quantity = 1`.

### 1.6 Strftime (`applyDateFormats`)

`Token_lib.php:81-144` maps `%` codes to `IntlDateFormatter` patterns:

```
%a EEE, %A EEEE, %b MMM, %B MMMM, %d dd, %D MM/dd/yy, %e d, %F yyyy-MM-dd,
%h MMM, %j D, %m MM, %U w, %V ww, %W ww, %y yy, %Y yyyy, %H HH, %I hh,
%l h, %M mm, %p a, %P a, %r hh:mm:ss a, %R HH:mm, %S ss, %T HH:mm:ss,
%X HH:mm:ss, %z ZZZZZ, %Z z, %g yy, %G yyyy, %u e, %w c
```

Special cases:
- `%%` → `%`
- `%n` → newline
- `%t` → tab
- `%C` → two-digit century (`intdiv(year,100)` zero-padded)
- `%c` → `yyyy-MM-dd HH:mm:ss`
- `%x` → `yyyy-MM-dd`
- `validStrftimeFormats` also includes `a A b B c d D e F g G h H I j m M n p P r R S t T u
  U V w W x X y Y z Z`; unknown characters are left unchanged.
- `%U`/`%V`/`%W` map to week numbers via ICU patterns (`w`/`ww`), which may differ from
  C strftime week semantics; replicate the ICU behavior.

---

## 2. Barcode engine (`app/Libraries/Barcode_lib.php`)

### 2.1 Supported types (32)

`C32, C39, C39+, C39E, C39E+, C93, S25, S25+, I25, I25+, C128, C128A, C128B, C128C,
EAN2, EAN5, EAN8, EAN13, ITF14, UPCA, UPCE, MSI, MSI+, POSTNET, PLANET, RMS4CC, KIX,
IMB, CODABAR, CODE11, PHARMA, PHARMA2T` (`Barcode_lib.php:19-52`).

Config `barcode_type` must be one of these uppercase keys. Default after migrations is
`C39` (the initial `Code39` is migrated by `20240319000000_Migration_Convert_Barcode_Types`).

### 2.2 Configuration

`get_barcode_config()` (`Barcode_lib.php:65-86`) returns:
`company`, `barcode_content`, `barcode_type`, `barcode_font`, `barcode_font_size`,
`barcode_height`, `barcode_width`, `barcode_first_row`, `barcode_second_row`,
`barcode_third_row`, `barcode_num_in_row`, `barcode_page_width`,
`barcode_page_cellspacing`, `barcode_generate_if_empty`, `barcode_formats` (decoded only
if not the literal `'null'`).

Defaults (final config catalog): `barcode_content=id`, `barcode_type=C39`,
`barcode_font=Arial`, `barcode_font_size=10`, `barcode_height=50`, `barcode_width=250`,
`barcode_first_row=category`, `barcode_second_row=item_code`,
`barcode_third_row=unit_price`, `barcode_num_in_row=2`, `barcode_page_width=100`,
`barcode_page_cellspacing=20`, `barcode_generate_if_empty=0`, `barcode_formats=[]`.

### 2.3 Value selection and generation

- `get_barcode_value`: if `barcode_content !== 'id'` → `item_number ?? name`; else
  `item_id` (`Barcode_lib.php:95-100`).
- `generate_barcode`: `BarcodeGeneratorSVG::getBarcode(value, barcode_type, 2,
  barcode_height)`; width factor fixed at 2; width config is used by the sheet CSS, not
  the generator (`:107-120`).
- `generate_receipt_barcode`: always `TYPE_CODE_128` (`:126-135`).
- `display_barcode`: table with first row / barcode / second row / third row; escapes
  labels; `character_limiter(...,40)` (`:144-189`).
- Row types: `name`, `category`, `cost_price`, `unit_price`, `company_name`, `item_code`,
  `not_show` (`manageDisplayLayout`, `:167-189`). `not_show` yields empty.
- `item_code` uses item_number when `barcode_content !== 'id'`, else item_id.
- `listfonts(folder)`: `.ttf` files in the folder plus a "none" option (`:197-214`).
- `get_font_name`: strips `.ttf` (`:222-225`).

### 2.4 Generate-if-empty

`Items::getGenerateBarcodes` (`Items.php:562-587`) reads `barcode_generate_if_empty` and
writes an item_number for items whose item_number is empty. The items report (`02-items.md`)
documents that upstream's implementation writes the empty value back and does **not**
actually auto-number. Decide via §11.4 UD-03; do not assume it works.

### 2.5 Barcode sheet layout

`app/Views/barcodes/barcode_sheet.php`:
- HTML doc, language code, title `Items.generate_barcodes`.
- `.barcode svg { height: barcode_height px; width: barcode_width px; }`.
- Body font class `font_<font name>` and font size.
- Table `border-spacing: cellspacing px; width: page_width %`.
- New `<tr>` every `barcode_num_in_row` items.
- Each cell calls `display_barcode`.

### 2.6 Duplicate barcodes

`allow_duplicate_barcodes=1` disables uniqueness checks in `Item`/`Item_kit`
(`Item.php:96`, `Item_kit.php:66`). The target must preserve the zero-prefixed barcode
exception: `ctype_digit && !str_starts_with('0')` identifies an ID; otherwise the string
is an item_number.

---

## 3. Document templates

The detailed template matrix is in `01-sales.md` §6.1–6.5; this section records the
fields that implementation agents most often miss.

### 3.1 Receipts (`receipt_default`, `receipt_short`)

Common:
- Wrapper font size `receipt_font_size` px.
- Logo from `uploads/<company_logo>` when non-empty.
- Company name only when `receipt_show_company_name`.
- Address `nl2br`, phone, `Sales.receipt`, transaction time.
- Customer when `$customer` set; `Sales.id: POS n`; invoice number when non-empty;
  employee.
- Item name `ucfirst(name . ' ' . attribute_values)` escaped.
- Item total field = `total` when `receipt_show_total_discount`, else `discounted_total`.
- Description/serial second row gated by `receipt_show_description` /
  `receipt_show_serialnumber`.
- Per-line discount row when `discount > 0`: fixed → `to_currency(discount) . " " .
  Sales.discount`; percent → `to_decimals(discount) . " " . Sales.discount_included`;
  then `discounted_total`.
- Whole-discount block when `receipt_show_total_discount && discount > 0`:
  - default: subtotal = `prediscount_subtotal`, discount = `-discount`;
  - short: subtotal = `subtotal` (upstream divergence).
- Tax block when `receipt_show_taxes`: subtotal then each `(float)tax_rate . '% ' .
  tax_group : to_currency_tax(sale_tax_amount)`.
- Total `to_currency(total)`.
- Payment rows: split type on `:`, first part as label, amount **negative**
  (`payment_amount * -1`).
- Giftcard balance when `cur_giftcard_value` set and any giftcard payment.
- Change/due label: `amount_change >= 0 ? (only_sale_check ? Sales.check_balance :
  Sales.change_due) : Sales.amount_due`; amount `to_currency(amount_change)`.
- Return policy `nl2br(esc(...))`.
- Barcode + sale id.

`receipt_short` differs: no price column, no tax-indicator column, description 50%/qty
25%/total 25%, company name not `nl2br`, whole-discount subtotal uses `subtotal`.

### 3.2 Invoice / tax invoice

`invoice.php`:
- Customer block (`company_name`/name, address, zip/city/state, account number, tax id)
  only when `$customer` set.
- Meta: invoice number, date, `invoice_total`.
- Item columns: item number; HSN when `include_hsn`; name (description for
  serialized/alt-description, else `name . attribute_values`); quantity; price; discount
  (fixed currency / percent with `%`); optional `customer_discount` per-unit column
  (`discounted_total / quantity`) when whole `discount > 0`; total `discounted_total`.
- Serialized sub-row.
- Totals: subtotal, tax groups, total; payments negative; giftcard balance; change/due
  when payments non-empty; terms `payment_message`, comments or
  `invoice_default_comments`, `return_policy`; barcode.
- `tax_invoice.php`: title `Sales.tax_invoice`, meta label `Sales.amount_due`; item name
  only; description/serial sub-row condition `is_serialized || allow_alt_description &&
  !empty(description)`; always prints an HSN cell (upstream bug); authorized signature
  label in the change row; barcode as base64 PNG `<img>`; a malformed `</td>` in the
  giftcard row.

### 3.3 Quote / work order

`quote.php`:
- Title `Sales.quote`; quote number/date/invoice total.
- Items: item number/name/qty/price/discount/total; optional customer_discount column
  (`discounted_total/quantity`); serialized sub-row.
- Totals: subtotal/taxes/total; payments **positive**; no giftcard balance, no change row.
- Terms: comments + `quote_default_comments`; no barcode; discard button
  `sales/discardsuspendedsale`.

`work_order.php`:
- Title from `$sales_work_order`; work-order label/number/date; amount due only when
  `print_price_info`.
- Items: item number/name/qty/discount always; price/total cells empty when
  `print_price_info` false.
- Totals block only when `print_price_info`; payments positive; comments; discard button
  `sales/discard_suspended_sale` (snake-case; upstream route is
  `discardsuspendedsale`, likely 404 — decide).

### 3.4 Email variants

| Template | Notes |
|---|---|
| `invoice_email.php` | Standalone HTML, inline CSS from `public/css/invoice_email.css`; logo data URI; customer `<pre>`; meta; item table without HSN/serial; subtotal/tax/total; payments negative; giftcard balance; change when payments; terms; barcode as SVG data URI. |
| `quote_email.php` | Quote number, no payments/change; comments + `quote_default_comments`; logo relative path (broken in email clients); no barcode image (prints quote number). |
| `receipt_email.php` | Wider receipt markup; logo via `Email_lib::buildLogoImgTag()` (data URI); no tax indicator; per-line discounts; `receipt_show_*` flags; payments negative; giftcard balance; change; SVG barcode data URI. |
| `work_order_email.php` | Inline `<link>` to `css/invoice_email.css`; logo relative; items without price suppression; subtotal uses `$tax_exclusive_subtotal` not provided by `_load_sale_data` (view contract mismatch); tax loop iterates `taxes as $name=>$value` over stored rows (likely broken); total; comments. |

### 3.5 Receiving receipt

`app/Views/receivings/receipt.php`:
- Wrapper, company header, `Sales.receiving` title, reference/time/employee/supplier.
- Item table: item number/name, quantity, unit cost, total (`item['total']` from
  `Receiving_lib::get_item_total`, i.e. `qty * receiving_quantity * price - discount`).
- Total; payment type; amount tendered/change when provided; return policy; barcode.
- Does not show tax groups or discounts separately.

### 3.6 Print pipeline

`app/Views/partial/print_receipt.php`:
- `printdoc()` uses Firefox `jsPrintSetup` when present: margins, header/footer
  suppression, printer selection from `localStorage[selected_printer]`, `clearSilentPrint`,
  `printSilent` when `!print_silently` (apparent inversion), `print()`.
- Falls back to `window.print()`.
- If `$print_after_sale`, on window load call `printdoc()` and after
  `print_delay_autoreturn * 1000` ms navigate to `sales`.
- `selected_printer` is `receipt_printer`/`invoice_printer`/`takings_printer`, set and
  stored in localStorage by the config view; never POSTed.

### 3.7 Print CSS

`public/css/ospos_print.css` defines receipt width/font/margins, hides navigation,
and is the source for the target's print stylesheet. Reproduce content, not pixels.

---

## 4. Email / SMS / Mailchimp

### 4.1 `Email_lib` (`app/Libraries/Email_lib.php`)

- Constructor builds CI4 `Email` config:
  `mailType=html`, `userAgent=OSPOS`, `validate=true`,
  `protocol` (default `mail`), `mailPath` (default `/usr/sbin/sendmail`),
  `SMTPHost`, `SMTPUser`, `SMTPPass` (decrypted with CI4 Encrypter when non-empty and
  `checkEncryption()`), `SMTPPort` (default 465), `SMTPTimeout` (default 5),
  `SMTPCrypto` (default `ssl`).
- `sendEmail(to, subject, message, ?attachment)`: from `config.email`/`config.company`;
  attaches file; sets attachment CID; logs `printDebugger()` on failure.
- `getLogoMimeType()`: `uploads/<company_logo>` MIME or empty.
- `buildLogoImgTag()`: base64 data URI `<img id="image" ...>` or empty.
- SMS config keys are separate and encrypted independently (`msg_pwd`).

### 4.2 `Sms_lib` (`app/Libraries/Sms_lib.php`)

- `sendSMS(int $phone, string $message): bool`.
- Decrypts `msg_pwd` when non-empty.
- Returns `false` if username, password, phone, message, or originator is empty.
- Otherwise returns `true`; **no network call**; only commented-out gateway examples.
- Therefore success means "configured", not "delivered".
- Controller `Messages::send`/`send_form` return localized success/failure + escaped phone.
- The per-person form prefills `msg_msg`; the standalone form does not.

### 4.3 `Mailchimp_lib`

- Used by Customers/Config, not Messages.
- `getLists`, `getList`, `getMembers`, `getMemberInfoById`, `getMemberInfo`,
  `getMemberActivity`, `addMember`, `removeMember`, `updateMember`,
  `addOrUpdateMember`.
- `addOrUpdateMember` sends `status_if_new: subscribed` and `merge_fields{FNAME,LNAME}`
  to `/lists/{id}/members/{md5(lower(email))}` (`Mailchimp_lib.php:323-336`).
- Config keys `mailchimp_api_key`/`mailchimp_list_id` are encrypted at rest and absent
  from the 138-row catalog until first save.

---

## 5. Formatting and helper contracts

| Helper | Behavior | Cite |
|---|---|---|
| `parse_decimals($number, ?$decimals)` | `NumberFormatter` parse with `number_locale`; rejects false, `> MAX_PRECISION`; returns float; negative allowed | `locale_helper.php:477-510` |
| `parse_quantity` | parse with `quantity_decimals` | `locale_helper.php` |
| `parse_tax` | parse with `tax_decimals` | `locale_helper.php` |
| `to_currency` | `NumberFormatter` CURRENCY, `currency_decimals`, grouping separator, symbol | `:370-373` |
| `to_currency_tax` | `tax_decimals` when `tax_included`, else `currency_decimals` | `:388-396` |
| `to_currency_no_money` | number without symbol | `:379` |
| `to_quantity_decimals` | `quantity_decimals` | `:423-426` |
| `to_decimals` | generic decimal formatter; grouping removed when `thousands_separator` empty | `:299+` |
| `to_date` / `to_datetime` | `dateformat` / `dateformat timeformat` | `:350-367` |
| `dateformat_mysql` | PHP date format → MySQL `DATE_FORMAT` | `:565+` |
| `is_right_side_currency_symbol` | locale pattern check for charts | `:299-309` |
| `get_payment_options` | ordered localized payment labels from `payment_options_order`; appends Due, Check, UPI (country IN), Bank Transfer, Wallet | `:240-283` |
| `get_reference_code_payment_types` | Debit/Credit only | `:286-291` |
| `importfile_helper` | `generate_import_items_csv(locations, attributes)` exact template | `importfile_helper.php` |
| `security_helper` | encryption key bootstrap, `checkEncryption`, `sanitize_filename`, `removeBackup` | `security_helper.php` |
| `dompdf_helper` | HTML→PDF bootstrap | `dompdf_helper.php` |

`MAX_PRECISION = 1e14`; `DEFAULT_PRECISION = 2` (`Constants.php`).

---

## 6. Target gap analysis

### 6.1 Token engine (`src/lib/token/index.ts`)

Confirmed defects:
- `scan` regex is `\{([A-Z]{2,4})(?::(\d+))?\}` — narrower than upstream; lowercase,
  mixed-case, and >4-char tokens do not render.
- Replacement uses `result.replace(whole, padded)`, which replaces only the **first**
  occurrence (upstream replaces all).
- `%` strftime is implemented as `{d}`/`{D}`-style braces via `STRFTIME_RE`, not `%`
  codes; default quote/WO formats (`Q%y{QSEQ:6}`) keep `%y` literal.
- `ISEQ` always acquires the next sequence, ignoring `ctx.value`/`save=false`; previews
  mutate the sequence.
- `SCO` counts all suspended, not only those with invoice numbers.
- `YCO` adds 1; upstream does not.
- `QCO` is named `YQO`; `{QCO}` falls through literal.
- `CU` requires `ctx.customerId`, never supplied by sale flows.
- `parseBarcode` is a simplified JSON-format regex parser and is never called.
- No barcode tokens `I/P/W`.

### 6.2 Barcode (`src/lib/barcode/index.tsx`, `app/api/items/barcodes-pdf`, page)

Confirmed defects:
- `barcode_type` config options are lowercase (`code39`, `code128`, …) while the
  generator/lookup expects uppercase keys.
- **Config value vs code mismatch:** upstream `barcode_content` values are `id|number`;
  the target `BarcodeConfig.content` is typed `"id" | "item_number" | "name"` and
  `getBarcodeValue()` only checks `"item_number"`/`"name"`, so a stored `number` falls
  through to the item id. Keep upstream `id|number` in config and map `number` to
  `item_number ?? name` in the generator.
- `barcode_width` default is inconsistent (`"2"` in lib vs `"250"` in page); upstream
  config width is 250 and the generator's width factor is fixed at 2.
- Sheet layout row types are wrong: target supports `id|item_number|name|category|
  unit_price|cost_price`; upstream supports `not_show|name|category|cost_price|
  unit_price|company_name|item_code`, with `character_limiter(40)`, `font_<font>` class,
  page width as a percentage and cellspacing in px.
- Default barcode type is `C128` in the lib but upstream default is `C39`; default rows
  are `id/name/unit_price` vs upstream `category/item_code/unit_price`.
- Symbology mapping collapses checksum/variant types: `C39+`, `C39E`, `C39E+` → `code39`;
  `C128A/B/C` → `code128`; `S25+`/`I25+`/`MSI+` → base. Map each to the bwip-js
  equivalent (or document the unsupported variants).
- Item-kit barcodes and generate-if-empty are missing.
- `barcode_formats` token parsing is ignored by the sale/receiving add flows.

### 6.3 Documents (`src/lib/pdf/*`, pages, email)

Confirmed defects:
- `buildReceiptData` total = `Σ unitPrice * abs(quantity)`, ignoring discounts,
  included/excluded tax, refunds, cash adjustment, split labels, giftcard remainder,
  tax names/rates.
- `Math.abs(quantityPurchased)` hides return signs.
- Payment "paid" includes cash-adjustment rows; change = `paid - total`.
- Receipt/invoice templates print `#{saleId}` rather than document numbers.
- Invoice PDF route renders `ReceiptDocument` (downloads a receipt as invoice).
- `custom_invoice`/`custom_tax_invoice` components/routes missing.
- Tax invoice has no HSN/serial/description/discount columns and no authorized signature.
- Email `sendSaleEmail` passes raw DB context to components typed as `ReceiptData`;
  `data.company/lines/total` are undefined; PDF render fails or emits blank.
- No print buttons/print CSS/auto-return; no email buttons on receipt/invoice pages.
- `sendPdfAction`/`email-action.tsx` are dead/unwired.

### 6.4 Email/SMS

- Email uses nodemailer SMTP only; no mail/sendmail protocol, no attachment CID parity,
  no logo data URI parity, no template-specific HTML.
- SMS uses Twilio REST, contrary to upstream's stub; no `msg_msg` default; no per-person
  form; no phone validation parity.
- Mailchimp signature lacks `status`/merge-field mapping in the caller.

### 6.5 Helpers

- Locale formatting is ad-hoc (`toFixed`/`toLocaleString`); no single
  `to_currency`/`to_currency_tax`/`to_quantity_decimals`/`to_date` implementation.
- CSV template/import helper semantics differ (see `02-items.md`, `06-people.md`).
- Encryption uses AES-256-GCM instead of CI4's format; legacy import conversion must be
  provided.

---

## 7. Implementation obligations

### T-01 — Token engine rewrite
**Files:** `src/lib/token/index.ts`, token classes, tests.
**Contract:** §1.1–1.6; support `{token}`/`{token:length}`, all occurrences, `%`
strftime, `CU/CO/ISEQ/QSEQ/WSEQ/SCO/YCO/QCO`, barcode tokens `I/P/W`, sequence
`save=false`, upstream count semantics. Remove `YQO`.
**Acceptance:** unit fixtures for each token, repeated tokens, mixed `%`/`{}` text,
zero-padding, preview vs save, `CO/SCO/YCO/QCO` counts, `parse_barcode` formats.

### T-02 — Barcode library rewrite
**Files:** `src/lib/barcode/*`, items barcode page/API, config tab.
**Contract:** §2; 32 types, uppercase config keys, `id|number` content, width/height/font,
row types, `character_limiter(40)`, sheet HTML, receipt C128, duplicate/zero-prefix rules.
**Acceptance:** barcode value fixtures for id/number/name; sheet layout snapshot; config
save/read round-trip; duplicate rule tests.

### T-03 — Receipt data builders
**Files:** `src/lib/pdf/data.ts`, `src/lib/pdf/*`, receipt pages.
**Contract:** §3.1; exact line totals, discounts, tax blocks, payment signs, giftcard
balance, change/due, return policy, barcode; preserve negative returns.
**Acceptance:** normalized text snapshots for default/short receipts across cash,
split, giftcard, discount, tax-included/excluded, return.

### T-04 — Invoice/quote/work-order builders
**Files:** `src/lib/pdf/{invoice,tax_invoice,quote,work_order}.tsx`, routes/pages.
**Contract:** §3.2–3.3; columns/HSN/serial/description/discount, totals, payment signs,
terms/comments, signatures, barcode, document numbers.
**Acceptance:** snapshots for each template and invoice_type; no receipt-as-invoice.

### T-05 — Email variants
**Files:** `src/lib/email/index.tsx`, `*_email` templates.
**Contract:** §3.4; per-type HTML, tokens, logo data URI/CID, attachments, terms,
barcode, recipient/no-email handling.
**Acceptance:** mocked transport snapshots; attachment MIME/CID; no undefined fields.

### T-06 — Print pipeline
**Files:** receipt/invoice pages, print CSS, config.
**Contract:** §3.6–3.7; `window.print()`, print-after-sale, delay/autoreturn, margins,
header/footer, printer localStorage selection; hide nav.
**Acceptance:** Playwright print media assertions and auto-return timing with fake clock.

### T-07 — Email/SMS/Mailchimp parity
**Files:** `src/lib/email`, `src/lib/sms`, `src/lib/mailchimp`, config.
**Contract:** §4; protocols, encryption, from/company, attachments, stub SMS contract,
per-person form, Mailchimp status/merge fields.
**Acceptance:** mocks for SMTP/SMS/Mailchimp; config-key encryption; message text.

### T-08 — Formatting helpers
**Files:** new `src/lib/format/*`; replace ad-hoc toFixed/toLocaleString.
**Contract:** §5; currency/quantity/tax/date/number, locale/grouping/symbol,
`to_currency_tax` decimal choice.
**Acceptance:** locale fixtures (en_US, de_DE, ar_EG, bn_BD) for numbers/dates/currency.

### T-09 — Import/security helpers
**Files:** `src/lib/csv/*`, `src/lib/encryption/*`.
**Contract:** CSV template/parse semantics from `02-items.md`/`06-people.md`; AES-GCM +
legacy CI3 conversion; `sanitize_filename`.
**Acceptance:** byte-identical item/customer templates; legacy secret decrypt/re-encrypt.

---

## 8. Unknowns

- Exact rendered pixel layout of dompdf vs `@react-pdf`; only content parity is required.
- Whether `print_silently`'s apparent inversion should be replicated; see §11.4.
- Whether the broken `work_order_email` variables should be fixed or replicated.
- Whether `tax_invoice`'s always-on HSN cell should be fixed or replicated.
- Exact CI4 Encrypter format for legacy secret import; determine from
  `app/Config/Encryption.php` + `security_helper.php`.
- `IntlDateFormatter` locale-dependent week-number behavior for `%U/%V/%W`.
- Whether the target should keep the Twilio adapter as an explicit extension.

---

*End of report. See `01-sales.md` §6 for the full template/flag matrix.*
