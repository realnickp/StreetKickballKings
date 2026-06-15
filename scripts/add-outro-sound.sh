#!/bin/bash
# Overlay sustained sound (beat bed + bass impact) across the flash transition and
# the logo-hold of an intro video, WITHOUT re-encoding the video (-c:v copy = fast).
# Usage: scripts/add-outro-sound.sh <teamid>
set -e
ID="$1"
cd "$(dirname "$0")/.."
VID="public/assets/video/intro-${ID}.mp4"
BED="public/assets/audio/music/in-match-beat-1.m4a"
STING="public/assets/audio/sfx/bassdrop.mp3"
[ -f "$VID" ] || { echo "MISSING video: $VID"; exit 1; }

D=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$VID")
# start the outro sound just before the flash (~2.5s before the end)
START=$(awk -v d="$D" 'BEGIN{ s=d-2.5; if(s<0)s=0; printf "%d", s*1000 }')
TMP="public/assets/video/_snd-${ID}.mp4"

ffmpeg -y -loglevel error -i "$VID" -i "$BED" -i "$STING" -filter_complex "
[0:a]apad=whole_dur=${D}[base];
[1:a]atrim=0:3.2,volume=1.0,afade=t=in:st=0:d=0.1,afade=t=out:st=2.6:d=0.5,adelay=${START}|${START}[bed];
[2:a]volume=1.3,adelay=${START}|${START}[hit];
[base][bed][hit]amix=inputs=3:duration=longest:normalize=0,atrim=0:${D},alimiter=limit=0.95[a]
" -map 0:v -map "[a]" -c:v copy -c:a aac -movflags +faststart "$TMP"
mv "$TMP" "$VID"
echo "sound added -> $VID"
