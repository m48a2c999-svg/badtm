"""English-labelled figures for the summary paper — four Seoul office areas (591 buildings) with the Yeoksam 257 buildings (2026-11-23).
usage: python3 figs_en4.py <r4_out_dir> <out4_dir> [function names]"""
import os, sys, json, math
exec(open('/tmp/claude-0/-home-claude/d855b01c-4d65-5c73-a219-ae59fd128dc1/scratchpad/papers2/figs_en.py').read().split('def f_site():')[0])
import pandas as pd
R4O, O4 = sys.argv[1:3]
U = json.load(open(os.path.join(O4, 'unified4.json')))['areas']; C = json.load(open(os.path.join(O4, 'compare257.json')))
REG = [('cbd', 'CBD', 'CBD'), ('gbd', 'GBD', 'Gangnam'), ('ybd', 'YBD', 'Yeouido'), ('mpo', 'MPO', 'Mapo')]
ALT = ['F0', 'LH_F0', 'VF_F0', 'S3', 'LH_C', 'VF_C', 'BT_T300', 'LT_T300', 'PK']
G257 = C['groups']['all257']
def T(reg): return pd.read_csv(os.path.join(R4O, f'targets_{reg}.csv'), encoding='utf-8-sig')

def p4_site():
    fig, axs = plt.subplots(2, 2, figsize=(W2, 4.5))
    cm = plt.get_cmap('Greys'); norm = matplotlib.colors.Normalize(5, 35)
    for a, (reg, A, nm) in zip(axs.ravel(), REG):
        O = json.load(open(os.path.join(R4O, f'badtm_osm_{reg}.json'), encoding='utf-8')); tg = T(reg)
        lat0 = tg.lat.mean(); lon0 = tg.lon.mean(); X = []; Y = []
        for f in O['blocks']:
            g = f['geometry']; rings = [g['coordinates'][0]] if g['type'] == 'Polygon' else [c[0] for c in g['coordinates']]
            for ring in rings:
                ring = np.array(ring); x, y = lonlat_xy(ring[:, 0], ring[:, 1], lon0, lat0)
                a.fill(x, y, fc='#f4f4f4', ec='black', lw=0.35); X += list(x); Y += list(y)
        x, y = lonlat_xy(tg.lon.values, tg.lat.values, lon0, lat0)
        sc = a.scatter(x, y, c=tg.obstr_mean_deg.values, cmap=cm, norm=norm, s=(4 if reg == 'gbd' else 9), edgecolor='black', lw=0.25, zorder=4)
        cx, cy = (min(X) + max(X)) / 2, (min(Y) + max(Y)) / 2; s = max(max(X) - min(X), max(Y) - min(Y)) / 2 * 1.06
        a.set_xlim(cx - s, cx + s); a.set_ylim(cy - s, cy + s); a.set_aspect('equal'); a.axis('off')
        sb = 200 if s < 800 else 500
        a.plot([cx + s * 0.35, cx + s * 0.35 + sb], [cy - s * 0.95] * 2, color='black', lw=1.4); a.text(cx + s * 0.35 + sb / 2, cy - s * 0.88, f'{sb} m', ha='center', fontsize=6)
        a.set_title(f'({"abcd"[[r[0] for r in REG].index(reg)]}) {nm}: {len(tg)} buildings, {len(O["blocks"])} blocks', fontsize=7)
    cb = fig.colorbar(sc, ax=axs.ravel().tolist(), shrink=0.5, pad=0.02); cb.set_label('Mean obstruction angle θ_m (°)', fontsize=6.5); cb.ax.tick_params(labelsize=6)
    save(fig, 'p4_site.png')

def p4_alts():
    fig, axs = plt.subplots(1, 2, figsize=(W2, 3.1), sharey=True)
    groups = [('YK', 'Yeoksam (257)', 'o')] + [(A, f'{nm} ({U[A]["form"]["n"]})', m) for (_, A, nm), m in zip(REG, ['s', 'D', '^', 'v'])]
    y = np.arange(len(ALT))[::-1]
    for a, cd, t in [(axs[0], 'with', '(a) With surrounding buildings'), (axs[1], 'nosh', '(b) Without surrounding buildings')]:
        for i, (g, lab, mk) in enumerate(groups):
            v = [G257[cd][k]['eui'] if g == 'YK' else U[g]['all'][cd][k]['eui'] for k in ALT]
            a.scatter(v, y + (i - 2) * 0.13, marker=mk, s=12, facecolor='black' if i % 2 == 0 else 'white', edgecolor='black', lw=0.6, label=lab, zorder=3)
        a.axvline(0, color='black', lw=0.6, ls=':'); a.set_title(t, fontsize=7); a.set_xlabel('EUI change (%, building median)', fontsize=6.5); a.tick_params(labelsize=6)
        for yy in y: a.axhline(yy - 0.5, color='#eee', lw=0.5, zorder=0)
    axs[0].set_yticks(y); axs[0].set_yticklabels([NAME[k] for k in ALT], fontsize=6)
    h, l = axs[0].get_legend_handles_labels(); fig.legend(h, l, loc='lower center', ncol=5, fontsize=6, bbox_to_anchor=(0.55, -0.03))
    fig.tight_layout(w_pad=0.5, rect=(0, 0.07, 1, 1)); save(fig, 'p4_alts.png')

def p4_tertile():
    sel = ['F0', 'LH_F0', 'S3', 'VF_C', 'BT_T300', 'PK']
    groups = [('YK', 'Yeoksam')] + [(A, nm) for _, A, nm in REG]
    fig, axs = plt.subplots(2, 3, figsize=(W2, 3.5))
    mk = {'low': ('o', 'white', 'Light'), 'mid': ('s', '#9e9e9e', 'Moderate'), 'high': ('D', 'black', 'Heavy')}
    for a, k in zip(axs.ravel(), sel):
        for i, (g, lab) in enumerate(groups):
            for t in ('low', 'mid', 'high'):
                if g == 'YK': v = G257['tertile'][k][t]
                else:
                    x = U[g]['all']['tertile'][k][t]; v = x['eui'] if x['n'] >= 3 else np.nan
                a.scatter(i, v, marker=mk[t][0], facecolor=mk[t][1], edgecolor='black', s=14, lw=0.6, zorder=3, label=mk[t][2] if (i == 0 and k == 'F0') else None)
        a.axhline(0, color='black', lw=0.5, ls=':'); a.set_xticks(range(len(groups))); a.set_xticklabels([g[1] for g in groups], fontsize=5.6, rotation=30)
        a.set_title(NAME[k], fontsize=6.8); a.tick_params(labelsize=5.8)
    for a in axs[:, 0]: a.set_ylabel('EUI change (%)', fontsize=6.5)
    fig.legend(loc='lower center', ncol=3, fontsize=6.2, bbox_to_anchor=(0.5, -0.02), title='Obstruction (Yeoksam tertile boundaries 14.6° / 22.8°)', title_fontsize=6)
    fig.tight_layout(rect=(0, 0.08, 1, 1), h_pad=0.8); save(fig, 'p4_tertile.png')

def p4_period():
    ks = [('S3', 'SC'), ('LH_C', 'LH_CS'), ('VF_C', 'VF_CS'), ('BT_T300', 'BT_T300Y'), ('LT_T300', 'LT_T300Y'), ('PK', 'PKS')]
    fig, axs = plt.subplots(1, 4, figsize=(W2, 2.6), sharey=True)
    y = np.arange(len(ks))[::-1]
    for a, (_, A, nm) in zip(axs, REG):
        for yy, (base, alt) in zip(y, ks):
            yr = U[A]['all']['with'][base]['eui'] if base not in ('BT_T300', 'LT_T300') else U[A]['added'][alt]['eui']
            cs = U[A]['added'][alt]['eui'] if base not in ('BT_T300', 'LT_T300') else U[A]['all']['with'][base]['eui']
            a.plot([yr, cs], [yy, yy], color='#999', lw=0.8, zorder=1)
            a.scatter(yr, yy, marker='o', s=14, facecolor='white', edgecolor='black', lw=0.6, zorder=3, label='Year-round' if yy == y[0] else None)
            a.scatter(cs, yy, marker='o', s=14, facecolor='black', edgecolor='black', lw=0.6, zorder=3, label='Cooling season (May–Sep)' if yy == y[0] else None)
        a.axvline(0, color='black', lw=0.5, ls=':'); a.set_title(nm, fontsize=7); a.tick_params(labelsize=6); a.set_xlabel('EUI change (%)', fontsize=6.3)
    axs[0].set_yticks(y); axs[0].set_yticklabels([NAME[b] for b, _ in ks], fontsize=6)
    h, l = axs[0].get_legend_handles_labels(); fig.legend(h, l, loc='lower center', ncol=2, fontsize=6.2, bbox_to_anchor=(0.55, -0.04))
    fig.tight_layout(w_pad=0.4, rect=(0, 0.08, 1, 1)); save(fig, 'p4_period.png')

if __name__ == '__main__':
    for f in (p4_site, p4_alts, p4_tertile, p4_period):
        if len(sys.argv) > 3 and f.__name__ not in sys.argv[3:]: continue
        f()
