# Coolkidz Gift Registry (theme side)

Theme files for the Coolkidz Gift Registry on coolkidz.com.au. The registry
data lives in the brand-dashboard API (`/api/registry/*`, store `coolkidz`),
the same engine as the UPPAbaby registry.

- `sections/ck-gift-registry.liquid` + `templates/page.gift-registry.json`: the
  `/pages/gift-registry` page (landing, `?r=` guest view, `?manage=` owner view)
- `assets/ck-registry.js`, `assets/ck-registry.css`
- `snippets/ck-registry-button.liquid`: "Add to gift registry" on product pages.
  Rendered from the theme's `snippets/buy-buttons.liquid`, straight after
  `{%- endform -%}` in the available-product branch:
  `{%- render 'ck-registry-button', product: product -%}`

Installed so far on the unpublished theme "Coolkidz Gift Registry (draft)"
(id 189044785441, a copy of the live Sleek theme).
