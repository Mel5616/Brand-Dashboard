# Coolkidz mix-and-save discount

A Shopify discount function for coolkidz.com.au: 5% off the order for two
different brands in the cart, 10% for three, 15% for four or more.

## Deploy (one time, about 2 minutes)

```bash
cd shopify-apps/coolkidz-mix-and-save
npx @shopify/cli@latest app deploy
```

The CLI opens a browser to log in with the Shopify account that owns the
"Brand Dashboard" app for the Coolkidz store. Only the extension is deployed
(`include_config_on_deploy = false`), so the app's scopes and settings are
untouched.

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
