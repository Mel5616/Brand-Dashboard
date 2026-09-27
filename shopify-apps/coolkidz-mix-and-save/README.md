# Coolkidz mix-and-save discount

A Shopify discount function for coolkidz.com.au: 5% off the order for two
different brands in the cart, 10% for three, 15% for four or more.

## Deploy (one time, about 5 minutes)

```bash
cd shopify-apps/coolkidz-mix-and-save
npx @shopify/cli@latest app config link
npx @shopify/cli@latest app deploy
```

1. `config link` opens a browser to log in, then asks which app. Choose the
   Coolkidz store's **Brand Dashboard** app and say yes to overwriting
   `shopify.app.toml`. This pulls the app's CURRENT settings (scopes, URLs), so the
   deploy can't strip the access the dashboard relies on.
2. `app deploy` builds and releases the "Mix and save" function.

Then switch it on:

```bash
python3 scripts/create_mix_discount.py
```

## Change the percentages

```bash
python3 scripts/create_mix_discount.py --tiers 5,10,15
```

Also update Theme settings > Coolkidz 2026 > Mix and save so the site's
messages match.

## Tests

```bash
node extensions/mix-and-save/test.mjs
```
