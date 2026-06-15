#!/bin/bash
# Make each team's logo outro ride THAT TEAM'S OWN music (continued from its own
# showcase), not a shared clip. Rebuilds the audio: team music through the showcase,
# then the team's own music looped under the logo + a bass impact at the flash.
# Video untouched (-c:v copy). Usage: scripts/fix-outro-audio.sh <teamid>
set -e
ID="$1"
cd "$(dirname "$0")/.."
VID="public/assets/video/intro-${ID}.mp4"
STING="public/assets/audio/sfx/bassdrop.mp3"
[ -f "$VID" ] || { echo "MISSING video: $VID"; exit 1; }

D=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$VID")
SPLIT=$(awk -v d="$D" 'BEGIN{ printf "%.3f", d-2.6 }')          # transition / logo start (~7.7s)
SMS=$(awk -v d="$D"  'BEGIN{ printf "%d", (d-2.6)*1000 }')      # same, in ms, for the bass hit
FOUT=$(awk -v d="$D" 'BEGIN{ printf "%.3f", d-0.5 }')
TMP="public/assets/video/_fa-${ID}.mp4"

# head = this team's music up to the flash; tail = the SAME team's music looped under the logo
ffmpeg -y -loglevel error -i "$VID" -i "$STING" -filter_complex "
[0:a]atrim=0:${SPLIT},asetpts=N/SR/TB[head];
[0:a]atrim=0:2.7,asetpts=N/SR/TB,afade=t=out:st=2.3:d=0.4[tail];
[head][tail]concat=n=2:v=0:a=1,atrim=0:${D},afade=t=out:st=${FOUT}:d=0.5[bed];
[1:a]volume=1.4,adelay=${SMS}|${SMS}[hit];
[bed][hit]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.95[a]
" -map 0:v -map "[a]" -c:v copy -c:a aac -movflags +faststart "$TMP"
mv "$TMP" "$VID"
echo "team-own outro music -> $VID"
