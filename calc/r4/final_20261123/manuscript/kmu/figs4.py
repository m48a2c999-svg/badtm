"""제7장(네 지역) 그림 — r4 자료(대상 목록, 축약 결과)와 unified4.json·compare257.json만 쓴다 (2026-11-23).
usage: python3 figs4.py <r4_out_dir> <red_dir> <out4_dir> [그림 함수 이름 ...]"""
import sys, gzip
exec(open('figs.py').read().split("# ------------------------------------------------------------------ 1-1")[0])
R4O, REDD, O4 = sys.argv[1:4]
def lonlat_xy(lon, lat, lon0=127.0365, lat0=37.5005):
    return (np.asarray(lon) - lon0) * 111320 * math.cos(math.radians(lat0)), (np.asarray(lat) - lat0) * 110540
REG = [('cbd', '도심'), ('gbd', '강남'), ('ybd', '여의도'), ('mpo', '마포')]
UA = {'cbd': 'CBD', 'gbd': 'GBD', 'ybd': 'YBD', 'mpo': 'MPO'}
def U(): return json.load(open(os.path.join(O4, 'unified4.json')))
def C257(): return json.load(open(os.path.join(O4, 'compare257.json')))
def T(reg):
    import pandas as pd
    return pd.read_csv(os.path.join(R4O, f'targets_{reg}.csv'), encoding='utf-8-sig')

def f_r4form():
    import pandas as pd
    yk = pd.read_sql('select obstruction_deg as obstr, floors from buildings', DB)
    groups = [('역삼\n257동', yk)] + [(f'{nm}\n{len(T(r))}동', T(r).rename(columns={'obstr_mean_deg': 'obstr', 'grnd_flr': 'floors'})) for r, nm in REG]
    fig, axs = plt.subplots(1, 2, figsize=(W, 2.5))
    for a, col, t in [(axs[0], 'obstr', '(a) 평균 차폐각(°)'), (axs[1], 'floors', '(b) 지상 층수')]:
        bp = a.boxplot([g[col].dropna() for _, g in groups], widths=0.5, patch_artist=True, showfliers=True, flierprops=dict(marker='.', ms=2.5), medianprops=dict(color='black', lw=1.3))
        for b_ in bp['boxes']: b_.set(facecolor='#d9d9d9', edgecolor='black', lw=0.6)
        a.set_xticklabels([g[0] for g in groups], fontsize=6.0); a.set_title(t, fontsize=7.5); a.tick_params(labelsize=6.5)
        if col == 'obstr':
            for v in (14.637, 22.777): a.axhline(v, color='black', lw=0.5, ls='--')
    fig.tight_layout(w_pad=0.8)
    save(fig, 'f7_2_r4form.png')

def f_r4alts():
    G = U()['areas']; g257 = C257()['groups']['all257']
    regs = [('yk', '역삼 257동', 'o')] + [(UA[r], nm, m) for (r, nm), m in zip(REG, ['s', 'D', '^', 'v'])]
    fig, axs = plt.subplots(1, 2, figsize=(W, 3.1), sharey=True)
    y = np.arange(len(ALT))[::-1]
    for a, cond, t in [(axs[0], 'with', '(a) 차폐 포함'), (axs[1], 'nosh', '(b) 차폐 제외')]:
        for i, (rg, lab, mk) in enumerate(regs):
            vals = [g257[cond][k]['eui'] if rg == 'yk' else G[rg]['all'][cond][k]['eui'] for k in ALT]
            a.scatter(vals, y + (i - 2) * 0.13, marker=mk, s=13, facecolor='black' if i % 2 == 0 else 'white', edgecolor='black', lw=0.6, label=lab, zorder=3)
        a.axvline(0, color='black', lw=0.6, ls=':'); a.set_title(t, fontsize=7.5); a.set_xlabel('EUI 변화(%, 건물별 중앙값)', fontsize=7)
        for yy in y: a.axhline(yy - 0.5, color='#eee', lw=0.5, zorder=0)
        a.tick_params(labelsize=6.3)
    axs[0].set_yticks(y); axs[0].set_yticklabels([NAME[k] for k in ALT], fontsize=6.3)
    h_, l_ = axs[0].get_legend_handles_labels(); fig.legend(h_, l_, loc='lower center', ncol=5, fontsize=6.2, bbox_to_anchor=(0.55, -0.03))
    fig.tight_layout(w_pad=0.5, rect=(0, 0.07, 1, 1))
    save(fig, 'f7_3_r4alts.png')

def f_r4tertile():
    G = U()['areas']
    D = collections.defaultdict(lambda: collections.defaultdict(list))
    for s, t, e in q("select sim_name,tag,dEUI_pct from results_257 where tag!='S1'"):
        D[t][('low', 'mid', 'high')[KCL[s]]].append(e)
    sel = ['F0', 'LH_F0', 'S3', 'VF_C', 'BT_T300', 'PK']
    regs = [('yk', '역삼\n257동')] + [(UA[r], nm) for r, nm in REG]
    fig, axs = plt.subplots(2, 3, figsize=(W, 3.5))
    mk = {'low': ('o', 'white'), 'mid': ('s', '#9e9e9e'), 'high': ('D', 'black')}
    for a, tg in zip(axs.ravel(), sel):
        for i, (rg, lab) in enumerate(regs):
            for ter in ('low', 'mid', 'high'):
                if rg == 'yk': v = np.median(D[tg][ter])
                else:
                    x = G[rg]['all']['tertile'][tg][ter]; v = x['eui'] if x['n'] >= 3 else np.nan
                a.scatter(i, v, marker=mk[ter][0], facecolor=mk[ter][1], edgecolor='black', s=15, lw=0.6, zorder=3,
                          label={'low': '적게 가려짐', 'mid': '중간', 'high': '많이 가려짐'}[ter] if (i == 0 and tg == 'F0') else None)
        a.axhline(0, color='black', lw=0.5, ls=':')
        a.set_xticks(range(len(regs))); a.set_xticklabels([r[1] for r in regs], fontsize=5.8)
        a.set_title(NAME[tg], fontsize=7); a.tick_params(labelsize=6)
    for a in axs[:, 0]: a.set_ylabel('EUI 변화(%)', fontsize=7)
    fig.legend(loc='lower center', ncol=3, fontsize=6.4, bbox_to_anchor=(0.5, -0.02))
    fig.tight_layout(rect=(0, 0.05, 1, 1), h_pad=0.8)
    save(fig, 'f7_4_r4tertile.png')

def f_r4enduse():
    G = U()['areas']
    sel = [('F0', '블라인드 고정'), ('S3', '블라인드 컷오프'), ('BT_T300', '블라인드 일사량 기준'), ('PK', '피크 시간대 폐쇄')]
    E257 = {r[0]: r for r in q('select tag,heat,cool,light,fan_pump_tower from enduse_257')}
    regs = [('yk', '역삼')] + [(UA[r], nm) for r, nm in REG]
    comps = [('난방(가스)', 'heat', 1, '#3a3a3a', None), ('냉방', 'cool', 2, '#ffffff', '////'), ('조명', 'light', 3, '#bdbdbd', None), ('팬·펌프·냉각탑', 'FPT', 4, '#ffffff', '....')]
    fig, axs = plt.subplots(1, 4, figsize=(W, 2.7), sharey=True)
    for a, (t, lab) in zip(axs, sel):
        for i, (rg, rl) in enumerate(regs):
            pos = 0; neg = 0; tot = 0
            for nm, key, ci, fc, ht in comps:
                if rg == 'yk': v = E257[t][ci]
                else:
                    e = G[rg]['enduse'][t]; v = (e['fan'] + e['pump'] + e['hr']) if key == 'FPT' else e[key]
                tot += v
                if v >= 0: a.bar(i, v, bottom=pos, color=fc, hatch=ht, ec='black', lw=0.4, width=0.62); pos += v
                else: a.bar(i, v, bottom=neg, color=fc, hatch=ht, ec='black', lw=0.4, width=0.62); neg += v
            a.plot(i, tot, marker='D', ms=3.0, color='black', mfc='white', zorder=5)
        a.axhline(0, color='black', lw=0.6); a.set_title(lab, fontsize=7); a.set_xticks(range(len(regs))); a.set_xticklabels([r[1] for r in regs], fontsize=5.6, rotation=90)
        a.tick_params(labelsize=6)
    axs[0].set_ylabel('변화(kWh/(m²·yr), 지역 합산)', fontsize=6.8)
    from matplotlib.patches import Patch
    from matplotlib.lines import Line2D
    h = [Patch(fc=fc, hatch=ht, ec='black', lw=0.4, label=nm) for nm, _, _, fc, ht in comps] + [Line2D([], [], marker='D', ms=3.5, color='black', mfc='white', lw=0, label='네 용도 합')]
    fig.legend(handles=h, loc='lower center', ncol=5, fontsize=6, bbox_to_anchor=(0.5, -0.04))
    fig.tight_layout(w_pad=0.3, rect=(0, 0.09, 1, 1))
    save(fig, 'f7_5_r4enduse.png')

def f_r4map():
    cmap = plt.get_cmap('Greys'); lim = 3.0
    fig, axs = plt.subplots(2, 2, figsize=(W, 4.6))
    for a, (reg, nm) in zip(axs.ravel(), REG):
        O = json.load(open(os.path.join(R4O, f'badtm_osm_{reg}.json'), encoding='utf-8'))
        import pandas as pd
        bp = os.path.join(O4, f'blocks4_{UA[reg]}.csv')   # derive4: 가구 EUI(가스 포함) 변화
        BL = pd.read_csv(bp, encoding='utf-8-sig').set_index('block')['dEUI_F0'].dropna().to_dict() if os.path.exists(bp) else {}
        tg = T(reg); n = len(tg)
        allx = []; ally = []
        for f in O['blocks']:
            pr = f['properties']; key = f"{pr['plan_id']}-{pr['block']}"
            g = f['geometry']; rings = [g['coordinates'][0]] if g['type'] == 'Polygon' else [c[0] for c in g['coordinates']]
            v = BL.get(key)
            for ring in rings:
                ring = np.array(ring); x, y = lonlat_xy(ring[:, 0], ring[:, 1], 127.0, 37.55)
                if v is None: a.fill(x, y, fc='white', ec='#bbb', lw=0.25)
                elif v < 0: a.fill(x, y, fc=cmap(0.25 + 0.7 * min(-v / lim, 1)), ec='black', lw=0.3)
                else: a.fill(x, y, fc='white', ec='black', lw=0.3, hatch='\\\\\\\\\\\\')
                allx += list(x); ally += list(y)
        x, y = lonlat_xy(tg.lon.values, tg.lat.values, 127.0, 37.55)
        a.scatter(x, y, s=(0.5 if reg == 'gbd' else 1.4), color='black', zorder=4)
        a.set_aspect('equal'); a.axis('off'); a.set_title(f'({"abcd"[REG.index((reg, nm))]}) {nm}({n}동)', fontsize=7)
        cx, cy = (min(allx) + max(allx)) / 2, (min(ally) + max(ally)) / 2; s = max(max(allx) - min(allx), max(ally) - min(ally)) / 2 * 1.06
        a.set_xlim(cx - s, cx + s); a.set_ylim(cy - s, cy + s)
        sb = 200 if s < 800 else 500
        a.plot([cx + s * 0.35, cx + s * 0.35 + sb], [cy - s * 0.95] * 2, color='black', lw=1.5); a.text(cx + s * 0.35 + sb / 2, cy - s * 0.89, f'{sb} m', ha='center', fontsize=6.0)
    from matplotlib.patches import Patch
    from matplotlib.lines import Line2D
    h = [Patch(fc=cmap(0.95), ec='black', lw=0.3, label='블라인드 고정의 가구 EUI 감소(진할수록 큼, 3% 이상 최진)'), Patch(fc='white', ec='black', lw=0.3, hatch='\\\\\\\\\\\\', label='증가'),
         Patch(fc='white', ec='#bbb', lw=0.3, label='계산 대상이 없는 가구'), Line2D([], [], marker='.', color='black', lw=0, ms=3, label='계산 대상 건물')]
    fig.legend(handles=h, loc='lower center', ncol=2, fontsize=6.0, bbox_to_anchor=(0.5, -0.04))
    fig.tight_layout(rect=(0, 0.07, 1, 1))
    save(fig, 'f7_1_r4map.png')

if __name__ == '__main__':
    fs = [f_r4map, f_r4form, f_r4alts, f_r4tertile, f_r4enduse]
    for f in fs:
        if len(sys.argv) > 4 and f.__name__ not in sys.argv[4:]: continue
        f()
