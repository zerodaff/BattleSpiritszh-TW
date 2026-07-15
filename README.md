# Battle Spirits Card Browser

This project is a standalone front-end for browsing Battle Spirits cards and building decks.

It is designed to work with Supabase as the backend so you can keep updating card data without Airtable.

## Features

- Search cards by number, name, and effect
- Filter by set, type, system, suffix, color, rarity, and cost
- View card details in a modal
- Add and remove cards from a local deck
- Preview the deck layout
- Export the deck as JSON
- Load card data from Supabase in real time

## Supabase schema

Use [`supabase.sql`](./supabase.sql) to create:

- `sets`
- `cards`
- `profiles`
- `decks`
- `deck_cards`

## Excel import mapping

See [`import-format.md`](./import-format.md) for the exact column mapping from your Excel export.

## Local config

Edit `index.html` and set:

```js
window.APP_CONFIG = {
  supabaseUrl: "https://YOUR_PROJECT.supabase.co",
  supabaseAnonKey: "YOUR_ANON_KEY",
  supabaseTable: "cards"
};
```

## Notes

- The app works with local demo data when Supabase is not configured.
- Card images can stay as Bandai URLs via `image_url`.
- New sets only need a new row in `sets` and matching `set_code` in `cards`.
