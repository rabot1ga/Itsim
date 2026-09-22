#!/bin/bash
set -e
cd /home/user/Itsim
node tools/art/avatar-key.mjs body tools/art/avatar-v2/masters/mannequin-v1.png tools/art/avatar-v2/layers/body_base.webp
build() { node tools/art/avatar-key.mjs layer "$1" "$2" "$3"; }
build tools/art/avatar-v2/masters/t1/eyes_normal.png eyes tools/art/avatar-v2/layers/eye_normal.webp
build tools/art/avatar-v2/masters/b2/eye_tired.png eyes tools/art/avatar-v2/layers/eye_tired.webp
build tools/art/avatar-v2/masters/b3/eye_vr.png eyes tools/art/avatar-v2/layers/eye_vr.webp
build tools/art/avatar-v2/masters/b3/eye_red.png eyes tools/art/avatar-v2/layers/eye_red.webp
build tools/art/avatar-v2/masters/b3/eye_legendary.png eyes tools/art/avatar-v2/layers/eye_legendary.webp
build tools/art/avatar-v2/masters/b5/eye_closed.png eyes tools/art/avatar-v2/layers/eye_closed.webp
build tools/art/avatar-v2/masters/t1/hair_short.png hair tools/art/avatar-v2/layers/hair_short.webp
build tools/art/avatar-v2/masters/b3/hair_messy.png hair tools/art/avatar-v2/layers/hair_messy.webp
build tools/art/avatar-v2/masters/b3/hair_manbun.png hair tools/art/avatar-v2/layers/hair_manbun.webp
build tools/art/avatar-v2/masters/b5/hair_buzzcut.png hair tools/art/avatar-v2/layers/hair_buzzcut.webp
build tools/art/avatar-v2/masters/b5/hair_curly.png hair tools/art/avatar-v2/layers/hair_curly.webp
build tools/art/avatar-v2/masters/b6/hair_long.png hair tools/art/avatar-v2/layers/hair_long.webp
build tools/art/avatar-v2/masters/b6/hair_ponytail.png hair tools/art/avatar-v2/layers/hair_ponytail.webp
build tools/art/avatar-v2/masters/b8/hair_undercut.png hair tools/art/avatar-v2/layers/hair_undercut.webp
build tools/art/avatar-v2/masters/b8/hair_spiky.png hair tools/art/avatar-v2/layers/hair_spiky.webp
build tools/art/avatar-v2/masters/t1/beard_goatee.png beard tools/art/avatar-v2/layers/beard_goatee.webp
build tools/art/avatar-v2/masters/b3/beard_stubble.png beard tools/art/avatar-v2/layers/beard_stubble.webp
build tools/art/avatar-v2/masters/b3/beard_full.png beard tools/art/avatar-v2/layers/beard_full.webp
build tools/art/avatar-v2/masters/b5/beard_mustache.png beard tools/art/avatar-v2/layers/beard_mustache.webp
build tools/art/avatar-v2/masters/t1/top_tshirt.png top tools/art/avatar-v2/layers/top_tshirt.webp
build tools/art/avatar-v2/masters/b4/top_hoodie_gray.png top tools/art/avatar-v2/layers/top_hoodie_gray.webp
build tools/art/avatar-v2/masters/b5/top_hoodie_localhost.png top tools/art/avatar-v2/layers/top_hoodie_localhost.webp
build tools/art/avatar-v2/masters/b6/top_shirt.png top tools/art/avatar-v2/layers/top_shirt.webp
build tools/art/avatar-v2/masters/b6/top_jacket.png top tools/art/avatar-v2/layers/top_jacket.webp
build tools/art/avatar-v2/masters/b7/top_hoodie_corp.png top tools/art/avatar-v2/layers/top_hoodie_corp.webp
build tools/art/avatar-v2/masters/b7/top_hoodie_cat.png top tools/art/avatar-v2/layers/top_hoodie_cat.webp
build tools/art/avatar-v2/masters/t1/bottom_jeans.png bottom tools/art/avatar-v2/layers/bottom_jeans.webp
build tools/art/avatar-v2/masters/b4/bottom_sweatpants.png bottom tools/art/avatar-v2/layers/bottom_sweatpants.webp
build tools/art/avatar-v2/masters/b5/bottom_chinos.png bottom tools/art/avatar-v2/layers/bottom_chinos.webp
build tools/art/avatar-v2/masters/b6/bottom_shorts.png bottom tools/art/avatar-v2/layers/bottom_shorts.webp
build tools/art/avatar-v2/masters/b6/bottom_suit.png bottom tools/art/avatar-v2/layers/bottom_suit.webp
build tools/art/avatar-v2/masters/t1/acc_cap.png acc_head tools/art/avatar-v2/layers/acc_cap.webp
build tools/art/avatar-v2/masters/b4/acc_headphones.png acc_ears tools/art/avatar-v2/layers/acc_headphones.webp
build tools/art/avatar-v2/masters/b5/acc_glasses.png acc_face tools/art/avatar-v2/layers/acc_glasses.webp
build tools/art/avatar-v2/masters/b5/acc_beanie.png acc_head tools/art/avatar-v2/layers/acc_beanie.webp
build tools/art/avatar-v2/masters/b6/acc_vr_headset.png acc_face tools/art/avatar-v2/layers/acc_vr_headset.webp
build tools/art/avatar-v2/masters/b6/acc_medal.png acc_chest tools/art/avatar-v2/layers/acc_medal.webp
cp tools/art/avatar-v2/layers/*.webp packages/client/public/layers/avatar-v2/
echo "DONE $(ls packages/client/public/layers/avatar-v2/*.webp|wc -l) layers"
