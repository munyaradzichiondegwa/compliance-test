import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';

export type Lang = 'en' | 'sn' | 'nd';
export const LANGS: { code: Lang; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'sn', label: 'chiShona' },
  { code: 'nd', label: 'isiNdebele' },
];

type Dict = Record<string, string>;

const en: Dict = {
  'nav.dashboard': 'Dashboard', 'nav.institutions': 'Institutions', 'nav.engagements': 'Compliance Work', 'nav.assessments': 'Assessments',
  'nav.systemsReviews': 'Systems Reviews', 'nav.recommendations': 'Recommendations', 'nav.risk': 'Risk Register', 'nav.gis': 'GIS Map',
  'nav.reports': 'Reports', 'nav.search': 'Search', 'nav.settings': 'Settings', 'nav.users': 'Users', 'nav.procurement': 'Procurement',
  'nav.committees': 'Integrity Committees', 'nav.pledges': 'Integrity Pledges', 'nav.ecmd': 'Compliance Dashboard (ECMD)', 'nav.plan': 'Monitoring Plan',
  'nav.auditFindings': 'Audit Findings', 'nav.funds': 'Fund Acquittals', 'nav.programmes': 'Projects & Programmes', 'nav.ic': 'IC Monitoring',
  'nav.aiGov': 'AI Governance', 'nav.fieldCapture': 'Field Capture', 'nav.auditLog': 'Audit Log', 'nav.whistleblower': 'Whistleblower Cases',
  'nav.workflow': 'Workflow Config', 'nav.notifAdmin': 'Notifications Admin', 'nav.certificates': 'Certificates',
  'common.signOut': 'Sign out', 'common.save': 'Save', 'common.cancel': 'Cancel', 'common.new': 'New', 'common.loading': 'Loading…',
  'common.status': 'Status', 'common.institution': 'Institution', 'common.language': 'Language', 'common.skip': 'Skip to main content',
  'common.offline': 'You are offline. Changes made in Field Capture are saved on this device and will be sent when you reconnect.',
  'common.notifications': 'Notifications', 'common.search': 'Search', 'common.download': 'Download', 'common.submit': 'Submit',
  'common.openMenu': 'Open menu', 'common.closeMenu': 'Close menu', 'common.none': 'None',
  'login.signIn': 'Sign in', 'login.email': 'Email address', 'login.password': 'Password', 'login.continue': 'Continue',
};

const sn: Dict = {
  'nav.dashboard': 'Dhashibhodhi', 'nav.institutions': 'Masangano', 'nav.engagements': 'Mabasa Ekutevedzera Mutemo', 'nav.assessments': 'Zvekuongorora',
  'nav.systemsReviews': 'Kuongororwa Kwehurongwa', 'nav.recommendations': 'Zvakakurudzirwa', 'nav.risk': 'Rejista Yenjodzi', 'nav.gis': 'Mepu',
  'nav.reports': 'Mishumo', 'nav.search': 'Tsvaga', 'nav.settings': 'Zvirongwa', 'nav.users': 'Vashandisi', 'nav.procurement': 'Kutenga',
  'nav.committees': 'Makomiti Eunhu', 'nav.pledges': 'Zvivimbiso', 'nav.ecmd': 'Dhashibhodhi Yekutevedzera Mutemo', 'nav.plan': 'Hurongwa Hwekutevedzera',
  'nav.auditFindings': 'Zvakawanikwa neOditi', 'nav.funds': 'Kuzivisa Kushandiswa Kwemari', 'nav.programmes': 'Mapurojekiti Nezvirongwa', 'nav.ic': 'Kutevedzera Makomiti Eunhu',
  'nav.aiGov': 'Kutonga AI', 'nav.fieldCapture': 'Kutora Ruzivo Munda', 'nav.auditLog': 'Rekodhi Yezviitwa', 'nav.whistleblower': 'Zvikwama Zvevanozivisa',
  'nav.workflow': 'Kurongwa Kwebasa', 'nav.notifAdmin': 'Manejimendi Yeziviso', 'nav.certificates': 'Zvitupa',
  'common.signOut': 'Buda', 'common.save': 'Chengetedza', 'common.cancel': 'Rega', 'common.new': 'Itsva', 'common.loading': 'Kurovera…',
  'common.status': 'Mamiriro', 'common.institution': 'Sangano', 'common.language': 'Mutauro', 'common.skip': 'Pfuurira kune zviri mukati',
  'common.offline': 'Hamuna internet. Zvamunoita muKutora Ruzivo Munda zvinochengetwa pafoni/komputa iyi uye zvichatumirwa kana mabatana zvakare.',
  'common.notifications': 'Ziviso', 'common.search': 'Tsvaga', 'common.download': 'Dhawunirodha', 'common.submit': 'Tumira',
  'common.openMenu': 'Vhura menyu', 'common.closeMenu': 'Vhara menyu', 'common.none': 'Hapana',
  'login.signIn': 'Pinda', 'login.email': 'Kero ye-imeri', 'login.password': 'Pasiwedhi', 'login.continue': 'Enderera',
};

const nd: Dict = {
  'nav.dashboard': 'Ibhodi Eliyinhloko', 'nav.institutions': 'Izikhungo', 'nav.engagements': 'Imisebenzi Yokulandela Umthetho', 'nav.assessments': 'Ukuhlolwa',
  'nav.systemsReviews': 'Ukubuyekezwa Kwezinhlelo', 'nav.recommendations': 'Izincomo', 'nav.risk': 'Irejista Yezingozi', 'nav.gis': 'Imephu',
  'nav.reports': 'Imibiko', 'nav.search': 'Sesha', 'nav.settings': 'Izilungiselelo', 'nav.users': 'Abasebenzisi', 'nav.procurement': 'Ukuthenga',
  'nav.committees': 'Amakomiti Obuqotho', 'nav.pledges': 'Izithembiso', 'nav.ecmd': 'Ibhodi Lokulandela Umthetho', 'nav.plan': 'Uhlelo Lokuqaphela',
  'nav.auditFindings': 'Okutholwe yi-Odithi', 'nav.funds': 'Ukubika Ukusetshenziswa Kwemali', 'nav.programmes': 'Amaphrojekthi Nezinhlelo', 'nav.ic': 'Ukuqaphela Amakomiti Obuqotho',
  'nav.aiGov': 'Ukulawula i-AI', 'nav.fieldCapture': 'Ukuqoqa Ulwazi Emkhakheni', 'nav.auditLog': 'Irekhodi Lezenzo', 'nav.whistleblower': 'Amacala Abatshayi Bempempe',
  'nav.workflow': 'Ukuhlelwa Komsebenzi', 'nav.notifAdmin': 'Ukuphathwa Kwezaziso', 'nav.certificates': 'Izitifiketi',
  'common.signOut': 'Phuma', 'common.save': 'Gcina', 'common.cancel': 'Khansela', 'common.new': 'Entsha', 'common.loading': 'Iyalayisha…',
  'common.status': 'Isimo', 'common.institution': 'Isikhungo', 'common.language': 'Ulimi', 'common.skip': 'Eqela uye okuqukethwe',
  'common.offline': 'Awunayo i-inthanethi. Okwenziwa kokuQoqa Ulwazi Emkhakheni kugcinwa kule divayisi kuthunyelwe uma uxhumeka futhi.',
  'common.notifications': 'Izaziso', 'common.search': 'Sesha', 'common.download': 'Landa', 'common.submit': 'Thumela',
  'common.openMenu': 'Vula imenyu', 'common.closeMenu': 'Vala imenyu', 'common.none': 'Lutho',
  'login.signIn': 'Ngena', 'login.email': 'Ikheli le-imeyili', 'login.password': 'Iphasiwedi', 'login.continue': 'Qhubeka',
};

const DICTS: Record<Lang, Dict> = { en, sn, nd };

interface Ctx { lang: Lang; setLang: (l: Lang) => void; t: (key: string) => string }
const I18nContext = createContext<Ctx>({ lang: 'en', setLang: () => {}, t: (k) => en[k] ?? k });

function initialLang(): Lang {
  try {
    const s = localStorage.getItem('zacc_lang');
    if (s === 'en' || s === 'sn' || s === 'nd') return s;
  } catch { /* storage unavailable */ }
  return 'en';
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang);
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);
  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try { localStorage.setItem('zacc_lang', l); } catch { /* ignore */ }
  }, []);
  const t = useCallback((key: string) => DICTS[lang][key] ?? en[key] ?? key, [lang]);
  return <I18nContext.Provider value={{ lang, setLang, t }}>{children}</I18nContext.Provider>;
}

export const useT = () => useContext(I18nContext);

export function LanguageSwitcher({ className = '' }: { className?: string }) {
  const { lang, setLang, t } = useT();
  return (
    <label className={`flex items-center gap-1.5 text-xs text-slate ${className}`}>
      <span className="sr-only">{t('common.language')}</span>
      <select className="border border-line rounded px-2 py-1 bg-paper text-ink text-xs" value={lang} onChange={(e) => setLang(e.target.value as Lang)} aria-label={t('common.language')}>
        {LANGS.map((l) => <option key={l.code} value={l.code} lang={l.code}>{l.label}</option>)}
      </select>
    </label>
  );
}
