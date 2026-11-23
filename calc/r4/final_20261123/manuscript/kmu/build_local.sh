set -e
cd /tmp/claude-0/-home-claude/d855b01c-4d65-5c73-a219-ae59fd128dc1/scratchpad/t2/kmu
O=out
rm -f $O/pm.json
for pass in 1 2 3; do
  FONT_EA="Noto Serif CJK KR" FONT_LAT="Noto Serif CJK KR" FONT_EQ="DejaVu Serif" python3 build_kmu.py $O/pdfsrc.docx $O/pm.json >/dev/null
  python3 ../lo_pdf.py $O/pdfsrc.docx $O/raw.pdf >/dev/null
  cp $O/pm.json $O/pm_prev.json 2>/dev/null || true
  python3 pagemap_kmu.py $O/raw.pdf $O/pdfsrc.docx.meta.json $O/pm.json
  if [ $pass -gt 1 ] && cmp -s $O/pm.json $O/pm_prev.json; then echo "stable at pass $pass"; break; fi
done
qpdf --linearize $O/raw.pdf $O/thesis.pdf
python3 build_kmu.py $O/thesis.docx $O/pm.json
pdfinfo $O/thesis.pdf | grep Pages
