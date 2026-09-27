# Coolkidz 2026 theme

The bright, modern coolkidz.com.au: a shop for parents (every brand in one
cart, mix-and-save, curated sets, gift registry) plus "Coolkidz for business"
for retailers and global brands.

Installed on the UNPUBLISHED theme "Coolkidz 2026 (draft)" (id 189044785441,
built on a copy of the live Sleek theme). Our templates use `layout/ck.liquid`;
customer-account, gift-card and password pages still use Sleek's layout.

    python3 build_templates.py     # writes templates/*.json + section groups
    python3 push.py [filter ...]   # pushes to the draft only (refuses the live theme)

Paths in build_templates.py/push.py point at the session scratchpad; update
D/paths if rebuilding from here. `_feed.json` comes from
scripts/coolkidz_brand_feed.py (build_blocks).

Theme settings > Coolkidz 2026: mix-and-save on/off and the 2/3/4+ brand
percentages (10/15/20). Keep it off until the discount is live at checkout.
