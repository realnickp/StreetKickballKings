#!/bin/bash
# Append a SICK logo-reveal outro to a team's intro: white-flash xfade from the
# showcase into a punch-in zoom of the real logo PNG + bass sting.
# Auto-strips a previously-added plain outro (videos > 9s) so re-runs don't stack.
# Usage: scripts/add-logo-outro.sh <teamid>
set -e
ID="$1"
cd "$(dirname "$0")/.."
LOGO="public/assets/logos/${ID}.png"
VID="public/assets/video/intro-${ID}.mp4"
STING="public/assets/audio/sfx/bassdrop.mp3"
[ -f "$LOGO" ] || { echo "MISSING logo: $LOGO"; exit 1; }
[ -f "$VID" ]  || { echo "MISSING video: $VID"; exit 1; }
T="public/assets/video/_t-${ID}"

DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$VID")
# strip a prior 2.5s outro if present (anything noticeably longer than an 8s showcase)
BASE=$(awk -v d="$DUR" 'BEGIN{ if (d>9.0) printf "%.3f", d-2.5; else printf "%.3f", d }')
OFF=$(awk -v b="$BASE" 'BEGIN{ printf "%.3f", b-0.4 }')

# 1) logo-reveal outro (2.6s): big punch-in zoom of the logo on dark bg + bass sting
ffmpeg -y -loglevel error -loop 1 -i "$LOGO" -i "$STING" -filter_complex "
color=c=0x0b0d12:s=720x1280:r=30:d=2.6[bg];
[0:v]scale=600:-1:force_original_aspect_ratio=decrease[lg];
[bg][lg]overlay=(W-w)/2:(H-h)/2[ov];
[ov]zoompan=z='if(lte(on,1),1.5,max(1.0,zoom-0.02))':d=78:s=720x1280:fps=30:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'[zp];
[zp]fade=t=out:st=2.25:d=0.35,format=yuv420p[v];
[1:a]atrim=0:2.6,afade=t=out:st=2.2:d=0.4[a]
" -map "[v]" -map "[a]" -t 2.6 -c:v libx264 -pix_fmt yuv420p -c:a aac "${T}-outro.mp4"

# 2) white-flash xfade from the (base portion of the) showcase into the logo reveal
ffmpeg -y -loglevel error -i "$VID" -i "${T}-outro.mp4" -filter_complex "
[0:v]scale=720:1280,fps=30,setsar=1,format=yuv420p,trim=0:${BASE},setpts=PTS-STARTPTS[v0];
[1:v]scale=720:1280,fps=30,setsar=1,format=yuv420p,setpts=PTS-STARTPTS[v1];
[v0][v1]xfade=transition=fadewhite:duration=0.4:offset=${OFF}[vx];
[0:a]atrim=0:${BASE},aresample=44100,asetpts=PTS-STARTPTS[a0];
[1:a]aresample=44100,asetpts=PTS-STARTPTS[a1];
[a0][a1]acrossfade=d=0.4[ax]
" -map "[vx]" -map "[ax]" -c:v libx264 -pix_fmt yuv420p -c:a aac "${T}-final.mp4"

mv "${T}-final.mp4" "$VID"
rm -f "${T}-outro.mp4"
echo "sick outro -> $VID"
