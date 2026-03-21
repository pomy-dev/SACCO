import { useEffect, useMemo, useRef, useState } from 'react'
import { ClipLoader } from 'react-spinners'
import './App.css'
import CompanyLogo from './assets/Img/logo.jpg'

const API_BASE_URL = 'http://10.150.51.51:5000'

const STORAGE_KEYS = {
  theme: 'sacco_portal_theme',
  session: 'sacco_portal_session_v1',
  draft: 'sacco_portal_draft_v1',
}

function safeJsonParse(value, fallback) {
  try {
    if (!value) return fallback
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

function clampNumber(n, { min, max }) {
  if (Number.isNaN(n)) return n
  if (typeof min === 'number') n = Math.max(min, n)
  if (typeof max === 'number') n = Math.min(max, n)
  return n
}

function parseCoordInput(value, { min, max }) {
  const s = String(value ?? '').trim()
  if (!s) return ''
  const n = Number(s)
  if (Number.isNaN(n)) return NaN
  return clampNumber(n, { min, max })
}

function normalizeBranchesInput(branches) {
  const arr = Array.isArray(branches) ? branches : []
  if (!arr.length) return []

  const toCoordString = (v) => {
    if (v === null || v === undefined || v === '') return ''
    return String(v)
  }

  return arr.map((b) => ({
    directionsText: String(b?.directionsText ?? b?.address ?? '').trim(),
    latitude: toCoordString(b?.latitude),
    longitude: toCoordString(b?.longitude),
  }))
}

function normalizeList(value) {
  if (!value) return []
  if (Array.isArray(value)) {
    return value
      .map((x) => String(x || '').trim())
      .filter(Boolean)
      .filter((v, i, a) => a.indexOf(v) === i)
  }
  if (typeof value === 'string') {
    return value
      .split(/\r?\n|,|;|\u2022|-/g)
      .map((x) => x.trim())
      .filter(Boolean)
      .filter((v, i, a) => a.indexOf(v) === i)
  }
  return []
}

function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const s = totalSeconds % 60
  const totalMinutes = Math.floor(totalSeconds / 60)
  const m = totalMinutes % 60
  const totalHours = Math.floor(totalMinutes / 60)
  const h = totalHours % 24
  const d = Math.floor(totalHours / 24)

  const two = (x) => String(x).padStart(2, '0')
  if (d > 0) return `${d}d ${two(h)}:${two(m)}:${two(s)}`
  return `${two(h)}:${two(m)}:${two(s)}`
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsDataURL(file)
  })
}

function App() {
  const [theme, setTheme] = useState(() => {
    const t = localStorage.getItem(STORAGE_KEYS.theme)
    return t === 'dark' || t === 'light' ? t : 'light'
  })

  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem(STORAGE_KEYS.theme, theme)
  }, [theme])

  const [session, setSession] = useState(() =>
    safeJsonParse(localStorage.getItem(STORAGE_KEYS.session), null),
  )
  const [draft, setDraft] = useState(() =>
    safeJsonParse(localStorage.getItem(STORAGE_KEYS.draft), null),
  )

  useEffect(() => {
    if (session === null) localStorage.removeItem(STORAGE_KEYS.session)
    else localStorage.setItem(STORAGE_KEYS.session, JSON.stringify(session))
  }, [session])

  useEffect(() => {
    if (draft === null) localStorage.removeItem(STORAGE_KEYS.draft)
    else localStorage.setItem(STORAGE_KEYS.draft, JSON.stringify(draft))
  }, [draft])

  const isLocked = useMemo(() => {
    if (!session?.expiresAt) return false
    return now >= session.expiresAt
  }, [now, session])

  const timeLeftMs = useMemo(() => {
    if (!session?.expiresAt) return null
    return Math.max(0, session.expiresAt - now)
  }, [now, session])

  const hasCompanyDetails = useMemo(() => {
    const c = draft?.company;
    if (!c) return false;
    return Boolean(
      String(c.companyName || '').trim() &&
      String(c.logoDataUrl || '').trim() &&
      String(c.consentDataUrl || '').trim() &&
      String(c.certificateDataUrl || '').trim()
    );
  }, [draft?.company]);

  const [step, setStep] = useState(() => {
    const cachedDraft = safeJsonParse(localStorage.getItem(STORAGE_KEYS.draft), null)
    const c = cachedDraft?.company
    const hasDetails = Boolean(
      String(c?.companyName || '').trim() &&
      String(c?.consentFileName || '').trim() &&
      String(c?.certificateFileName || '').trim(),
    )
    if (session?.verified && session?.expiresAt && Date.now() < session.expiresAt) {
      return hasDetails ? 'products' : 'details'
    }
    return 'email'
  })

  const otpRef = useRef({ value: null, createdAt: 0 })
  const [otpRequested, setOtpRequested] = useState(false)
  const [otpError, setOtpError] = useState('')
  const [otpValue, setOtpValue] = useState('')
  const [isRequestingOtp, setIsRequestingOtp] = useState(false)
  const [isVerifyOtp, setIsVerifyOtp] = useState(false)

  const [verifyForm, setVerifyForm] = useState(() => {
    const branchesFromDraft = normalizeBranchesInput(draft?.company?.branches)
    const hasLegacyCoords =
      Boolean(draft?.company?.directionsText) ||
      draft?.company?.latitude !== '' ||
      draft?.company?.longitude !== ''

    const legacyBranch = hasLegacyCoords
      ? [
        {
          directionsText: draft?.company?.directionsText || '',
          latitude:
            draft?.company?.latitude === '' || draft?.company?.latitude === undefined
              ? ''
              : String(draft?.company?.latitude),
          longitude:
            draft?.company?.longitude === '' || draft?.company?.longitude === undefined
              ? ''
              : String(draft?.company?.longitude),
        },
      ]
      : [{ directionsText: '', latitude: '', longitude: '' }]

    const branches = branchesFromDraft.length ? branchesFromDraft : legacyBranch

    return {
      companyName: draft?.company?.companyName || '',
      email: draft?.company?.email || '',
      branches,
      themeColor: draft?.company?.themeColor || '#6d28d9',
      logoFile: { name: draft?.company?.name, url: draft?.company?.url } || {},
      consentFile: { name: draft?.company?.name, url: draft?.company?.url } || {},
      certificateFile: { name: draft?.company?.name, url: draft?.company?.url } || {},
      supportEmail: draft?.company?.supportEmail || '',
      companyPhone: draft?.company?.companyPhone || '',
      whatsapp: draft?.company?.whatsapp || '',
      twitter: draft?.company?.twitter || '',
      facebook: draft?.company?.facebook || '',
      instagram: draft?.company?.instagram || '',
      website: draft?.company?.website || '',
      operationalHours: draft?.company?.operationalHours || '',
    }
  })

  const [indabukoLogoOk, setIndabukoLogoOk] = useState(true)

  const [productDraft, setProductDraft] = useState(() => ({
    name: '',
    summary: '',
    description: '',
    interestRateApr: '',
    minDurationMonths: '',
    maxDurationMonths: '',
    requirements: [],
    charges: '',
    eligibility: [],
    repaymentFrequency: 'Monthly',
    minAmount: '',
    maxAmount: '',
    collateral: '',
    processingTime: '',
    applicationSteps: [],
    monthlyPremium: '',
    coverageAmount: '',
    policyType: 'Life',
    coverageDetails: [],
    minInvestment: '',
    expectedReturns: '',
    riskLevel: 'Medium',
    investmentStrategy: '',
    minBalance: '',
    compoundingFrequency: 'Monthly',
  }))

  const [requirementsInput, setRequirementsInput] = useState('')
  const [eligibilityInput, setEligibilityInput] = useState('')
  const [applicationStepsInput, setApplicationStepsInput] = useState('')
  const [coverageDetailsInput, setCoverageDetailsInput] = useState('')

  const products = draft?.products ?? []
  const [editingId, setEditingId] = useState(null)
  const [view, setView] = useState('edit')
  const [submittedAt, setSubmittedAt] = useState(() => draft?.submittedAt || null)
  const [isSubmitting, setIsSubmitting] = useState(false);
  const hasSubmitted = Boolean(submittedAt)

  useEffect(() => {
    const themeColor = draft?.company?.themeColor || verifyForm.themeColor
    if (themeColor) document.documentElement.style.setProperty('--brand', themeColor)
  }, [draft?.company?.themeColor, verifyForm.themeColor])

  async function onPickLogo(file) {
    if (!file) return
    const dataUrl = await readFileAsDataUrl(file)
    setVerifyForm((v) => ({
      ...v,
      logoFile: { name: file.name, url: dataUrl }
    }))
  }

  async function onPickConsent(file) {
    if (!file) return;
    const dataUrl = await readFileAsDataUrl(file);
    setVerifyForm((v) => ({
      ...v,
      consentFile: { name: file.name, url: dataUrl }
    }));
  }

  async function onPickCertificate(file) {
    if (!file) return;
    const dataUrl = await readFileAsDataUrl(file);
    setVerifyForm((v) => ({
      ...v,
      certificateFile: { name: file.name, url: dataUrl }
    }));
  }

  function persistCompanyDraft(nextCompany) {
    setDraft((d) => ({
      ...(d || {}),
      company: nextCompany,
      products: d?.products || [],
      updatedAt: Date.now(),
    }))
  }

  async function requestOtp() {
    setOtpError('');
    const email = verifyForm.email.trim();

    if (!email || !email.includes('@')) {
      return setOtpError('A valid email is required.');
    }

    try {
      setIsRequestingOtp(true)

      const response = await fetch(`${API_BASE_URL}/api/request-otp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to request OTP');
      }

      // Success → move to OTP input screen
      // otpRef.current = { value: otp, createdAt: Date.now() }
      setOtpRequested(true);
      setOtpValue('');
      setStep('otp');

      const nextCompany = {
        ...(draft?.company || {}),
        email,
      }
      persistCompanyDraft(nextCompany)

      // Optional: nice user feedback
      alert('OTP sent! Check your email (including spam/junk folder). It expires in 10 minutes.');

    } catch (err) {
      console.error('OTP request failed:', err);
      setOtpError(err.message || 'Could not send OTP. Please try again.');
    } finally {
      setIsRequestingOtp(false)
    }
  }

  async function verifyOtp() {
    setOtpError('');
    const email = verifyForm.email.trim();
    const code = otpValue.trim();

    if (!code || code.length !== 6) {
      return setOtpError('Please enter the 6-digit code from your email.');
    }

    try {
      setIsVerifyOtp(true);

      if (!otpRequested) return setOtpError('Please request an OTP first.')

      const response = await fetch(`${API_BASE_URL}/api/verify-otp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, otp: code }),
      });

      const data = await response.json();

      if (!response.ok) throw new Error(data.error || 'Verification failed');

      if (data.error) setOtpError('Incorrect OTP. Please try again.');

      // Success – create session and proceed
      const startAt = Date.now();
      const expiresAt = startAt + 18 * 60 * 60 * 1000; // 18 hours

      setSession({
        verified: true,
        startAt,
        expiresAt,
        companyEmail: email,
        companyName: verifyForm.companyName.trim() || '',
      });

      setStep(hasCompanyDetails ? 'products' : 'details');

    } catch (err) {
      console.error('OTP verification failed:', err);
      setOtpError(err.message || 'Invalid or expired OTP. Please try again.');
    } finally {
      setIsVerifyOtp(false);
    }
  }

  function saveCompanyDetailsAndContinue() {
    setOtpError('');
    const name = verifyForm.companyName.trim();
    if (!name) return setOtpError('Company name is required.');
    if (!verifyForm.logoFile?.url) return setOtpError('Company logo is required.');
    if (!verifyForm.consentFile?.url) return setOtpError('Signed consent document is required.');
    if (!verifyForm.certificateFile?.url) return setOtpError('Company verification certificate is required.');

    // Normalize branch addresses + coordinates as a bundle.
    const inputBranches = Array.isArray(verifyForm.branches) ? verifyForm.branches : []
    const normalizedBranches = []
    for (const b of inputBranches) {
      const directionsText = String(b?.directionsText ?? '').trim()
      const latitude = parseCoordInput(b?.latitude, { min: -90, max: 90 })
      const longitude = parseCoordInput(b?.longitude, { min: -180, max: 180 })

      const hasAnyValue = Boolean(directionsText) || latitude !== '' || longitude !== ''
      if (!hasAnyValue) continue

      if (Number.isNaN(latitude) || Number.isNaN(longitude)) {
        return setOtpError('Latitude and longitude must be valid numbers.')
      }
      if ((latitude === '' && longitude !== '') || (latitude !== '' && longitude === '')) {
        return setOtpError('Provide both latitude and longitude for a branch.')
      }

      normalizedBranches.push({
        directionsText,
        latitude: latitude === '' ? '' : latitude,
        longitude: longitude === '' ? '' : longitude,
      })
    }

    const firstBranch = normalizedBranches[0] || { directionsText: '', latitude: '', longitude: '' }

    const nextCompany = {
      ...(draft?.company || {}),
      companyName: name,
      email: verifyForm.email.trim().toLowerCase(),
      // New structure: multiple branches, each bundling address + coordinates.
      branches: normalizedBranches,
      // Backward-compatible fields (server may still read these today).
      directionsText: firstBranch.directionsText,
      latitude: firstBranch.latitude,
      longitude: firstBranch.longitude,
      themeColor: verifyForm.themeColor,
      logoFile: { name: verifyForm.logoFile?.name, url: verifyForm.logoFile?.url },
      consentFile: { name: verifyForm.consentFile?.name, url: verifyForm.consentFile?.url },
      certificateFile: { name: verifyForm.certificateFile?.name, url: verifyForm.certificateFile?.url },
      supportEmail: verifyForm.supportEmail.trim(),
      companyPhone: verifyForm.companyPhone.trim(),
      whatsapp: verifyForm.whatsapp.trim(),
      twitter: verifyForm.twitter.trim(),
      facebook: verifyForm.facebook.trim(),
      instagram: verifyForm.instagram.trim(),
      website: verifyForm.website.trim(),
      operationalHours: verifyForm.operationalHours.trim(),
    };

    persistCompanyDraft(nextCompany);
    setSession((s) => (s ? { ...s, companyName: name, companyEmail: verifyForm.email.trim() } : s));
    setStep('products');
  }

  function resetPortal() {
    setSession(null)
    setDraft(null)
    localStorage.removeItem(STORAGE_KEYS.session)
    localStorage.removeItem(STORAGE_KEYS.draft)

    // Reset all user-editable fields back to defaults.
    setVerifyForm({
      companyName: '',
      email: '',
      branches: [{ directionsText: '', latitude: '', longitude: '' }],
      themeColor: '#6d28d9',
      logoFile: {},
      consentFile: {},
      certificateFile: {},
      supportEmail: '',
      companyPhone: '',
      whatsapp: '',
      twitter: '',
      facebook: '',
      instagram: '',
      website: '',
      operationalHours: '',
    })

    setProductDraft({
      name: '',
      summary: '',
      description: '',
      category: 'Savings',
      interestRateApr: '',
      minDurationMonths: '',
      maxDurationMonths: '',
      requirements: [],
      charges: '',
      eligibility: [],
      repaymentFrequency: 'Monthly',
      minAmount: '',
      maxAmount: '',
      collateral: '',
      processingTime: '',
      applicationSteps: [],
      monthlyPremium: '',
      coverageAmount: '',
      policyType: 'Life',
      coverageDetails: [],
      minInvestment: '',
      expectedReturns: '',
      riskLevel: 'Medium',
      investmentStrategy: '',
      minBalance: '',
      compoundingFrequency: 'Monthly',
    })

    setRequirementsInput('')
    setEligibilityInput('')
    setApplicationStepsInput('')
    setCoverageDetailsInput('')

    setIsSubmitting(false)
    setView('edit')
    setEditingId(null)
    setSubmittedAt(null)
    setOtpRequested(false)
    otpRef.current = { value: null, createdAt: 0 }
    setOtpValue('')
    setOtpError('')
    setStep('email')
  }

  // ==================== UPSERT WITH ALL NEW FIELDS ====================
  function upsertProduct() {
    const name = productDraft.name.trim()
    if (!name) return

    const newId =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `p_${Date.now()}_${Math.random().toString(16).slice(2)}`

    const normalized = {
      id: editingId || newId,
      name,
      category: productDraft.category,
      summary: productDraft.summary.trim(),
      description: productDraft.description.trim(),
      interestRateApr:
        productDraft.interestRateApr === ''
          ? ''
          : clampNumber(Number(productDraft.interestRateApr), { min: 0, max: 200 }),
      minDurationMonths:
        productDraft.minDurationMonths === ''
          ? ''
          : clampNumber(Number(productDraft.minDurationMonths), { min: 0, max: 600 }),
      maxDurationMonths:
        productDraft.maxDurationMonths === ''
          ? ''
          : clampNumber(Number(productDraft.maxDurationMonths), { min: 0, max: 600 }),
      requirements: normalizeList(productDraft.requirements),
      charges: productDraft.charges.trim(),
      eligibility: normalizeList(productDraft.eligibility),
      repaymentFrequency: productDraft.repaymentFrequency,
      minAmount:
        productDraft.minAmount === '' ? '' : clampNumber(Number(productDraft.minAmount), { min: 0 }),
      maxAmount:
        productDraft.maxAmount === '' ? '' : clampNumber(Number(productDraft.maxAmount), { min: 0 }),
      collateral: productDraft.collateral.trim(),
      // NEW fields
      processingTime: productDraft.processingTime.trim(),
      applicationSteps: normalizeList(productDraft.applicationSteps),
      monthlyPremium:
        productDraft.monthlyPremium === ''
          ? ''
          : clampNumber(Number(productDraft.monthlyPremium), { min: 0 }),
      coverageAmount:
        productDraft.coverageAmount === ''
          ? ''
          : clampNumber(Number(productDraft.coverageAmount), { min: 0 }),
      policyType: productDraft.policyType,
      coverageDetails: normalizeList(productDraft.coverageDetails),
      minInvestment:
        productDraft.minInvestment === ''
          ? ''
          : clampNumber(Number(productDraft.minInvestment), { min: 0 }),
      expectedReturns:
        productDraft.expectedReturns === ''
          ? ''
          : clampNumber(Number(productDraft.expectedReturns), { min: 0, max: 1000 }),
      riskLevel: productDraft.riskLevel,
      investmentStrategy: productDraft.investmentStrategy.trim(),
      minBalance:
        productDraft.minBalance === ''
          ? ''
          : clampNumber(Number(productDraft.minBalance), { min: 0 }),
      compoundingFrequency: productDraft.compoundingFrequency,
      updatedAt: Date.now(),
    }

    setDraft((d) => {
      const current = d || { company: verifyForm, products: [] }
      const list = Array.isArray(current.products) ? current.products : []
      const idx = list.findIndex((p) => p.id === normalized.id)
      const nextProducts =
        idx >= 0
          ? [...list.slice(0, idx), normalized, ...list.slice(idx + 1)]
          : [normalized, ...list]
      return { ...current, products: nextProducts, updatedAt: Date.now() }
    })

    setEditingId(null)
    // FULL RESET INCLUDING NEW FIELDS
    setProductDraft({
      name: '',
      category: 'Savings',
      summary: '',
      description: '',
      interestRateApr: '',
      minDurationMonths: '',
      maxDurationMonths: '',
      requirements: [],
      charges: '',
      eligibility: [],
      repaymentFrequency: 'Monthly',
      minAmount: '',
      maxAmount: '',
      collateral: '',
      processingTime: '',
      applicationSteps: [],
      monthlyPremium: '',
      coverageAmount: '',
      policyType: 'Life',
      coverageDetails: [],
      minInvestment: '',
      expectedReturns: '',
      riskLevel: 'Medium',
      investmentStrategy: '',
      minBalance: '',
      compoundingFrequency: 'Monthly',
    })
    setRequirementsInput('')
    setEligibilityInput('')
    setApplicationStepsInput('')
    setCoverageDetailsInput('')
  }

  function editProduct(p) {
    setEditingId(p.id)
    setProductDraft({
      name: p.name || '',
      category: p.category || 'Savings',
      summary: p.summary || '',
      description: p.description || '',
      interestRateApr: p.interestRateApr === '' ? '' : String(p.interestRateApr ?? ''),
      minDurationMonths: p.minDurationMonths === '' ? '' : String(p.minDurationMonths ?? ''),
      maxDurationMonths: p.maxDurationMonths === '' ? '' : String(p.maxDurationMonths ?? ''),
      requirements: normalizeList(p.requirements),
      charges: p.charges || '',
      eligibility: normalizeList(p.eligibility),
      repaymentFrequency: p.repaymentFrequency || 'Monthly',
      minAmount: p.minAmount === '' ? '' : String(p.minAmount ?? ''),
      maxAmount: p.maxAmount === '' ? '' : String(p.maxAmount ?? ''),
      collateral: p.collateral || '',
      // NEW fields
      processingTime: p.processingTime || '',
      applicationSteps: normalizeList(p.applicationSteps),
      monthlyPremium: p.monthlyPremium === '' ? '' : String(p.monthlyPremium ?? ''),
      coverageAmount: p.coverageAmount === '' ? '' : String(p.coverageAmount ?? ''),
      policyType: p.policyType || 'Life',
      coverageDetails: normalizeList(p.coverageDetails),
      minInvestment: p.minInvestment === '' ? '' : String(p.minInvestment ?? ''),
      expectedReturns: p.expectedReturns === '' ? '' : String(p.expectedReturns ?? ''),
      riskLevel: p.riskLevel || 'Medium',
      investmentStrategy: p.investmentStrategy || '',
      minBalance: p.minBalance === '' ? '' : String(p.minBalance ?? ''),
      compoundingFrequency: p.compoundingFrequency || 'Monthly',
    })
    setRequirementsInput('')
    setEligibilityInput('')
    setApplicationStepsInput('')
    setCoverageDetailsInput('')
    setView('edit')
    setStep('products')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function deleteProduct(id) {
    setDraft((d) => {
      const list = d?.products || []
      return { ...(d || {}), products: list.filter((p) => p.id !== id), updatedAt: Date.now() }
    })
    if (editingId === id) setEditingId(null)
  }

  async function submitAll() {
    try {
      setIsSubmitting(true)
      const payload = {
        SaccoEntity: draft?.company || {},
        SaccoEntityProducts: draft?.products || [],
      };

      const response = await fetch(`${API_BASE_URL}/api/submit-sacco`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Submission failed');
      }

      const result = await response.json();

      const ts = Date.now()
      setSubmittedAt(ts)
      setDraft((d) => ({ ...(d || {}), submittedAt: ts, updatedAt: ts }))
      setView('submitted')

      alert(`Success! ${result.message}\n\nYou can now view your products in the Business Link app.`);
    } catch (err) {
      console.error(err);
      setOtpError(`Submission failed: ${err.message}`);
    } finally {
      setIsSubmitting(false)
    }
  }

  const headerCompany = draft?.company?.companyName || session?.companyName || 'SACCO Company'
  const headerEmail = draft?.company?.email || session?.companyEmail || ''

  return (
    <div className="portal">
      <header className="topbar">
        <div className="brand">
          <div className="brandMark" aria-hidden="true" />
          <div className="brandText">
            <div className="brandTitle">SACCO PORTAL</div>
            <div className="brandSub">Company onboarding • Product listing • Review & submit</div>
          </div>
        </div>

        <div className="topbarRight">
          {session?.verified && !isLocked && (
            <div className="pill">
              <span className="pillLabel">Session</span>
              <span className="pillValue">{formatDuration(timeLeftMs ?? 0)} left</span>
            </div>
          )}

          <button
            className="btn ghost"
            type="button"
            onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
            aria-label="Toggle dark mode"
            title="Toggle dark mode"
          >
            {theme === 'dark' ? 'Light 🔆' : 'Dark 🌙'}
          </button>

          <button className="btn ghost" type="button" onClick={resetPortal}>
            Reset
          </button>
        </div>
      </header>

      <main className="content">
        {isLocked ? (
          <section className="card">
            <div className="cardHeader">
              <h1>Session locked</h1>
              <p>
                Your company session has reached the <strong>18-hour limit</strong>. Please restart
                verification to continue.
              </p>
            </div>

            <div className="cardBody">
              <div className="notice danger">
                <div className="noticeTitle">Why this happens</div>
                <div className="noticeText">
                  For security and compliance, company access to this portal is time-bound. After
                  18 hours, you must re-verify via OTP.
                </div>
              </div>

              <div className="actions">
                <button className="btn primary" type="button" onClick={resetPortal}>
                  Restart verification
                </button>
              </div>
            </div>
          </section>
        ) : step === 'email' ? (
          <section className="card">
            <div className="cardHeader">
              <h1>Enter Company Email</h1>
              <p>
                For simplicity, start by confirming your email via OTP. After OTP, you’ll complete
                your company profile (name, theme, documents, and coordinates).
              </p>
            </div>

            <div className="cardBody">
              {otpError ? (
                <div className="notice danger">
                  <div className="noticeTitle">Action required</div>
                  <div className="noticeText">{otpError}</div>
                </div>
              ) : null}

              <label className="field">
                <span className="label">Company email</span>
                <input
                  value={verifyForm.email}
                  onChange={(e) => setVerifyForm((v) => ({ ...v, email: e.target.value }))}
                  placeholder="e.g. info@sacco.co.sz"
                  autoComplete="email"
                  inputMode="email"
                />
                <div className="hint">We’ll send a 6-digit OTP to this email (demo).</div>
              </label>

              <div className="actions">
                <button className="btn primary" type="button" onClick={requestOtp}>
                  {isRequestingOtp ? (
                    <ClipLoader
                      color={'#AAA'}
                      loading={isRequestingOtp}
                      size={10}
                      aria-label="Loading Spinner"
                      data-testid="loader"
                    />
                  ) : 'Send OTP'}
                </button>
                <button
                  className="btn"
                  type="button"
                  onClick={() =>
                    persistCompanyDraft({
                      ...(draft?.company || {}),
                      email: verifyForm.email.trim(),
                    })
                  }
                  disabled={verifyForm.email === ''}
                >
                  Save draft
                </button>
              </div>

              <div className="fineprint">
                By continuing you confirm you are authorized to represent the company and that all
                submitted information is accurate.
              </div>
            </div>
          </section>
        ) : step === 'details' ? (
          <section className="card">
            <div className="cardHeader">
              <h1>Company Details</h1>
              <p>
                Complete your company profile. These details help clients identify your SACCO, contact you,
                and learn about your products and operating hours.
              </p>
            </div>

            <div className="cardBody">
              {otpError ? (
                <div className="notice danger">
                  <div className="noticeTitle">Action required</div>
                  <div className="noticeText">{otpError}</div>
                </div>
              ) : null}

              <div className="grid two">
                <label className="field">
                  <span className="label">Company email</span>
                  <input value={verifyForm.email} readOnly />
                  <div className="hint">Email verified via OTP.</div>
                </label>

                <label className="field">
                  <span className="label">Company name <span className="required">*</span></span>
                  <input
                    value={verifyForm.companyName}
                    onChange={(e) =>
                      setVerifyForm((v) => ({ ...v, companyName: e.target.value }))
                    }
                    placeholder="e.g. Swazi Teachers SACCO"
                    autoComplete="organization"
                    required
                  />
                </label>
              </div>

              {/* New social & contact fields */}
              <div className="grid two">
                <label className="field">
                  <span className="label">Support email</span>
                  <input
                    type="email"
                    value={verifyForm.supportEmail || ''}
                    onChange={(e) =>
                      setVerifyForm((v) => ({ ...v, supportEmail: e.target.value.trim() }))
                    }
                    placeholder="e.g. support@sacco.co.sz"
                  />
                  <div className="hint">For customer inquiries (optional but recommended)</div>
                </label>

                <label className="field">
                  <span className="label">Company phone</span>
                  <input
                    type="tel"
                    value={verifyForm.companyPhone || ''}
                    onChange={(e) =>
                      setVerifyForm((v) => ({ ...v, companyPhone: e.target.value.trim() }))
                    }
                    placeholder="e.g. +268 2400 1234"
                  />
                </label>
              </div>

              <div className="grid three">
                <label className="field">
                  <span className="label">WhatsApp number</span>
                  <input
                    type="tel"
                    value={verifyForm.whatsapp || ''}
                    onChange={(e) =>
                      setVerifyForm((v) => ({ ...v, whatsapp: e.target.value.trim() }))
                    }
                    placeholder="e.g. +268 7600 5678"
                  />
                  <div className="hint">For quick support</div>
                </label>

                <label className="field">
                  <span className="label">Website</span>
                  <input
                    type="url"
                    value={verifyForm.website || ''}
                    onChange={(e) =>
                      setVerifyForm((v) => ({ ...v, website: e.target.value.trim() }))
                    }
                    placeholder="https://www.sacco.co.sz"
                  />
                </label>

                <label className="field">
                  <span className="label">Twitter / X handle</span>
                  <input
                    value={verifyForm.twitter || ''}
                    onChange={(e) =>
                      setVerifyForm((v) => ({ ...v, twitter: e.target.value.trim() }))
                    }
                    placeholder="@YourSacco"
                  />
                </label>
              </div>

              <div className="grid two">
                <label className="field">
                  <span className="label">Facebook page</span>
                  <input
                    type="url"
                    value={verifyForm.facebook || ''}
                    onChange={(e) =>
                      setVerifyForm((v) => ({ ...v, facebook: e.target.value.trim() }))
                    }
                    placeholder="https://facebook.com/YourSacco"
                  />
                </label>

                <label className="field">
                  <span className="label">Instagram handle</span>
                  <input
                    value={verifyForm.instagram || ''}
                    onChange={(e) =>
                      setVerifyForm((v) => ({ ...v, instagram: e.target.value.trim() }))
                    }
                    placeholder="@your_sacco"
                  />
                </label>
              </div>

              {/* Documents + Logo in one row (3-column grid) */}
              <div className="grid three">
                <label className="field">
                  <span className="label">Company logo <span className="required">*</span></span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => onPickLogo(e.target.files?.[0] || null)}
                    required
                  />
                  {verifyForm.logoFile?.url ? (
                    <div className="logoPreview">
                      <img src={verifyForm.logoFile?.url} alt="Company logo preview" />
                      <div className="hint success">Logo ready</div>
                    </div>
                  ) : (
                    <div className="hint danger">Required (PNG/JPG).</div>
                  )}
                </label>

                <label className="field">
                  <span className="label">Signed consent document <span className="required">*</span></span>
                  <input
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg"
                    onChange={(e) => onPickConsent(e.target.files?.[0] || null)}
                    required
                  />
                  {verifyForm.consentFile?.url ? (
                    <div className="hint success">Consent ready ({verifyForm.consentFile?.name})</div>
                  ) : (
                    <div className="hint danger">Required</div>
                  )}
                </label>

                <label className="field">
                  <span className="label">Company verification <span className="required">*</span></span>
                  <input
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg"
                    onChange={(e) => onPickCertificate(e.target.files?.[0] || null)}
                    required
                  />
                  {verifyForm.certificateFile?.url ? (
                    <div className="hint success">Certificate ready ({verifyForm.certificateFile?.name})</div>
                  ) : (
                    <div className="hint danger">Required</div>
                  )}
                </label>
              </div>

              {/* Multi-branch address + coordinates editor */}
              <div className="field">
                <span className="label">Branch addresses & coordinates (optional)</span>
                <div className="stack" style={{ gap: 12 }}>
                  {verifyForm.branches.map((b, idx) => (
                    <div key={idx}>
                      <div className="grid two">
                        <label className="field">
                          <span className="label">Directions / address</span>
                          <input
                            value={b.directionsText}
                            onChange={(e) => {
                              const nextDirections = e.target.value
                              setVerifyForm((v) => {
                                const next = (v.branches || []).map((x, i) =>
                                  i === idx ? { ...x, directionsText: nextDirections } : x,
                                )
                                return { ...v, branches: next }
                              })
                            }}
                            placeholder="e.g. Mbabane, Plot 12, Main Road"
                            autoComplete="street-address"
                          />
                        </label>

                        <div className="grid two tight">
                          <label className="field">
                            <span className="label">Latitude</span>
                            <input
                              value={b.latitude}
                              onChange={(e) => {
                                const nextLatitude = e.target.value
                                setVerifyForm((v) => {
                                  const next = (v.branches || []).map((x, i) =>
                                    i === idx ? { ...x, latitude: nextLatitude } : x,
                                  )
                                  return { ...v, branches: next }
                                })
                              }}
                              placeholder="-26.305"
                              inputMode="decimal"
                            />
                          </label>
                          <label className="field">
                            <span className="label">Longitude</span>
                            <input
                              value={b.longitude}
                              onChange={(e) => {
                                const nextLongitude = e.target.value
                                setVerifyForm((v) => {
                                  const next = (v.branches || []).map((x, i) =>
                                    i === idx ? { ...x, longitude: nextLongitude } : x,
                                  )
                                  return { ...v, branches: next }
                                })
                              }}
                              placeholder="31.136"
                              inputMode="decimal"
                            />
                          </label>
                        </div>
                      </div>

                      <div className="actions" style={{ justifyContent: 'flex-end', marginTop: 8 }}>
                        <button
                          className="btn small ghost"
                          type="button"
                          onClick={() => {
                            setVerifyForm((v) => {
                              const next = v.branches.filter((_, i) => i !== idx)
                              return { ...v, branches: next.length ? next : [{ directionsText: '', latitude: '', longitude: '' }] }
                            })
                          }}
                          disabled={verifyForm.branches.length === 1}
                        >
                          Cancel Address
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="actions" style={{ justifyContent: 'flex-start', marginTop: 10 }}>
                  <button
                    className="btn small"
                    type="button"
                    onClick={() =>
                      setVerifyForm((v) => ({
                        ...v,
                        branches: [...(v.branches || []), { directionsText: '', latitude: '', longitude: '' }],
                      }))
                    }
                  >
                    + Add Address Branch
                  </button>
                </div>
                <div className="hint">Each branch bundles its address and coordinates together.</div>
              </div>

              <div className='grid two'>
                <label className="field">
                  <span className="label">Portal theme color</span>
                  <div className="colorRow">
                    <input
                      type="color"
                      value={verifyForm.themeColor}
                      onChange={(e) =>
                        setVerifyForm((v) => ({ ...v, themeColor: e.target.value }))
                      }
                      aria-label="Theme color picker"
                    />
                    <input
                      value={verifyForm.themeColor}
                      onChange={(e) =>
                        setVerifyForm((v) => ({ ...v, themeColor: e.target.value }))
                      }
                      spellCheck={false}
                    />
                  </div>
                  <div className="hint">This color brands the portal for your company (optional).</div>
                </label>

                <label className="field">
                  <span className="label">Operational days & time</span>
                  <input
                    value={verifyForm.operationalHours || ''}
                    onChange={(e) =>
                      setVerifyForm((v) => ({ ...v, operationalHours: e.target.value }))
                    }
                    placeholder="e.g. Monday–Friday: 08:00–16:30"
                    rows={4}
                  />
                  <div className="hint">List your branch hours clearly</div>
                </label>
              </div>

              <div className="actions">
                <button
                  className="btn primary"
                  type="button"
                  onClick={saveCompanyDetailsAndContinue}
                  disabled={
                    !verifyForm.companyName.trim() ||
                    !verifyForm.logoFile?.url ||
                    !verifyForm.consentFile?.url ||
                    !verifyForm.certificateFile?.url
                  }
                >
                  Continue to products
                </button>
                <button
                  className="btn"
                  type="button"
                  onClick={() =>
                    persistCompanyDraft({
                      ...(draft?.company || {}),
                      ...verifyForm,
                    })
                  }
                >
                  Save draft
                </button>
              </div>
            </div>
          </section>
        ) : step === 'otp' ? (
          <section className="card">
            <div className="cardHeader">
              <h1>Email OTP confirmation</h1>
              <p>
                We sent a 6-digit OTP to <strong>{headerEmail || 'your email'}</strong>. Enter it
                to unlock the portal (valid for 10 minutes).
              </p>
            </div>

            <div className="cardBody">
              {otpError ? (
                <div className="notice danger">
                  <div className="noticeTitle">Verification failed</div>
                  <div className="noticeText">{otpError}</div>
                </div>
              ) : null}

              <div className="otpRow">
                <label className="field">
                  <span className="label">OTP code</span>
                  <input
                    value={otpValue}
                    type='number'
                    onChange={(e) =>
                      setOtpValue(e.target.value.replace(/[^\d]/g, '').slice(0, 6))
                    }
                    placeholder="123456"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                  />
                </label>
                <button className="btn primary" type="button" onClick={verifyOtp}>
                  {isVerifyOtp ?
                    (
                      <ClipLoader
                        color={'#AAA'}
                        loading={isVerifyOtp}
                        size={10}
                        aria-label="Loading Spinner"
                        data-testid="loader"
                      />
                    ) : 'Verify'}
                </button>
              </div>

              <div className="actions">
                <button className="btn" type="button" onClick={() => setStep('email')}>
                  Back
                </button>
                <button className="btn ghost" type="button" onClick={requestOtp}>
                  Resend OTP
                </button>
              </div>
            </div>
          </section>
        ) : (
          <section className="stack">
            <section className="card">
              <div className="cardHeader">
                <div className="headerRow">
                  <div>
                    <h1>{headerCompany}</h1>
                    <p>
                      Add your financial products, then review everything before submitting. Access
                      stays open for <strong>18 hours</strong> after verification.
                    </p>
                  </div>
                  {draft?.company?.logoFile?.url ? (
                    <img className="companyLogo" src={draft.company.logoFile?.url} alt="" />
                  ) : (
                    <div className="companyLogo placeholder" aria-hidden="true">
                      {String(headerCompany || 'S').slice(0, 1).toUpperCase()}
                    </div>
                  )}
                </div>
              </div>

              <div className="cardBody">
                <div className="tabs">
                  <button
                    className={view === 'edit' ? 'tab active' : 'tab'}
                    type="button"
                    onClick={() => setView('edit')}
                    disabled={hasSubmitted || isSubmitting}
                  >
                    Create / Edit
                  </button>
                  <button
                    className={view === 'review' ? 'tab active' : 'tab'}
                    type="button"
                    onClick={() => setView('review')}
                    disabled={hasSubmitted || isSubmitting}
                  >
                    Review ({products.length})
                  </button>
                  <button
                    className={view === 'submitted' ? 'tab active' : 'tab'}
                    type="button"
                    onClick={() => setView('submitted')}
                    disabled={hasSubmitted ? true : products.length === 0 || isSubmitting}
                  >
                    Submit
                  </button>
                </div>

                {view === 'edit' ? (
                  <>
                    <div className="notice">
                      <div className="noticeTitle">
                        {editingId ? 'Editing product' : 'New product'}
                      </div>
                      <div className="noticeText">
                        Fill the key details. Fields change automatically when you toggle the category tabs above.
                      </div>
                    </div>

                    {/* ==================== PRODUCT NAME ==================== */}
                    <label className="field">
                      <span className="label">Product name</span>
                      <input
                        value={productDraft.name}
                        onChange={(e) =>
                          setProductDraft((p) => ({ ...p, name: e.target.value }))
                        }
                        placeholder="e.g. Salary Advance Loan"
                      />
                    </label>

                    {/* ==================== CATEGORY TABS (NEW) ==================== */}
                    <div className="field">
                      <span className="label">Category</span>
                      <div className="tabs">
                        {['Savings', 'Loans', 'Insurance', 'Investments'].map((cat) => (
                          <button
                            key={cat}
                            type="button"
                            className={`tab ${productDraft.category === cat ? 'active' : ''}`}
                            onClick={() =>
                              setProductDraft((p) => ({ ...p, category: cat }))
                            }
                          >
                            {cat}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* ==================== COMMON FIELDS ==================== */}
                    <label className="field">
                      <span className="label">One-line summary</span>
                      <input
                        value={productDraft.summary}
                        onChange={(e) =>
                          setProductDraft((p) => ({ ...p, summary: e.target.value }))
                        }
                        placeholder="e.g. Fast short-term loan for salaried members"
                      />
                    </label>

                    <label className="field">
                      <span className="label">Description</span>
                      <textarea
                        value={productDraft.description}
                        onChange={(e) =>
                          setProductDraft((p) => ({ ...p, description: e.target.value }))
                        }
                        placeholder="Explain how the product works, who it’s for, and key benefits."
                        rows={4}
                      />
                    </label>

                    <div className="field">
                      <span className="label">Requirements</span>
                      <div className="listBuilderRow">
                        <input
                          value={requirementsInput}
                          onChange={(e) => setRequirementsInput(e.target.value)}
                          placeholder="e.g. National ID"
                        />
                        <button
                          className="btn small"
                          type="button"
                          onClick={() => {
                            const next = requirementsInput.trim()
                            if (!next) return
                            setProductDraft((p) => ({
                              ...p,
                              requirements: normalizeList([...(p.requirements || []), next]),
                            }))
                            setRequirementsInput('')
                          }}
                        >
                          Add
                        </button>
                        {
                          normalizeList(productDraft.requirements).length > 0 && (
                            <button
                              className="btn small ghost"
                              type="button"
                              onClick={() => setProductDraft((p) => ({ ...p, requirements: [] }))}
                              disabled={normalizeList(productDraft.requirements).length === 0}
                            >
                              Clear all
                            </button>
                          )
                        }
                      </div>
                      {normalizeList(productDraft.requirements).length ? (
                        <div className="listItems">
                          {normalizeList(productDraft.requirements).map((item) => (
                            <div key={item} className="listItem">
                              <span className="listText">{item}</span>
                              <button
                                className="btn small ghost"
                                type="button"
                                onClick={() =>
                                  setProductDraft((p) => ({
                                    ...p,
                                    requirements: normalizeList(p.requirements).filter((x) => x !== item),
                                  }))
                                }
                                aria-label={`Remove requirement: ${item}`}
                                title="Remove"
                              >
                                ✕
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="hint">
                          Add items like IDs, payslips, membership proof, bank statements, etc.
                        </div>
                      )}
                    </div>

                    <div className="field">
                      <span className="label">Eligibility</span>
                      <div className="listBuilderRow">
                        <input
                          value={eligibilityInput}
                          onChange={(e) => setEligibilityInput(e.target.value)}
                          placeholder="e.g. Salaried members"
                        />
                        <button
                          className="btn small"
                          type="button"
                          onClick={() => {
                            const next = eligibilityInput.trim()
                            if (!next) return
                            setProductDraft((p) => ({
                              ...p,
                              eligibility: normalizeList([...(p.eligibility || []), next]),
                            }))
                            setEligibilityInput('')
                          }}
                        >
                          Add
                        </button>
                        {
                          normalizeList(productDraft.eligibility).length > 0 && (
                            <button
                              className="btn small ghost"
                              type="button"
                              onClick={() => setProductDraft((p) => ({ ...p, eligibility: [] }))}
                              disabled={normalizeList(productDraft.eligibility).length === 0}
                            >
                              Clear all
                            </button>
                          )
                        }
                      </div>
                      {normalizeList(productDraft.eligibility).length ? (
                        <div className="listItems">
                          {normalizeList(productDraft.eligibility).map((item) => (
                            <div key={item} className="listItem">
                              <span className="listText">{item}</span>
                              <button
                                className="btn small ghost"
                                type="button"
                                onClick={() =>
                                  setProductDraft((p) => ({
                                    ...p,
                                    eligibility: normalizeList(p.eligibility).filter((x) => x !== item),
                                  }))
                                }
                                aria-label={`Remove eligibility: ${item}`}
                                title="Remove"
                              >
                                ✕
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="hint">
                          Add who qualifies (membership status, age bracket, employment type, etc.).
                        </div>
                      )}
                    </div>

                    <div className="field">
                      <span className="label">Fees & charges</span>
                      <textarea
                        value={productDraft.charges}
                        onChange={(e) =>
                          setProductDraft((p) => ({ ...p, charges: e.target.value }))
                        }
                        placeholder="Application fees, service charges, penalties, etc."
                        rows={3}
                      />
                    </div>

                    {/* ==================== NEW COMMON: APPLICATION STEPS ==================== */}
                    <div className="field">
                      <span className="label">How to start / Application process steps</span>
                      <div className="listBuilderRow">
                        <input
                          value={applicationStepsInput}
                          onChange={(e) => setApplicationStepsInput(e.target.value)}
                          placeholder="e.g. 1. Be a verified member"
                        />
                        <button
                          className="btn small"
                          type="button"
                          onClick={() => {
                            const next = applicationStepsInput.trim()
                            if (!next) return
                            setProductDraft((p) => ({
                              ...p,
                              applicationSteps: normalizeList([...(p.applicationSteps || []), next]),
                            }))
                            setApplicationStepsInput('')
                          }}
                        >
                          Add
                        </button>
                        {
                          normalizeList(productDraft.applicationSteps).length > 0 && (
                            <button
                              className="btn small ghost"
                              type="button"
                              onClick={() => setProductDraft((p) => ({ ...p, applicationSteps: [] }))}
                              disabled={normalizeList(productDraft.applicationSteps).length === 0}
                            >
                              Clear all
                            </button>
                          )
                        }
                      </div>
                      {normalizeList(productDraft.applicationSteps).length ? (
                        <div className="listItems">
                          {normalizeList(productDraft.applicationSteps).map((item) => (
                            <div key={item} className="listItem">
                              <span className="listText">{item}</span>
                              <button
                                className="btn small ghost"
                                type="button"
                                onClick={() =>
                                  setProductDraft((p) => ({
                                    ...p,
                                    applicationSteps: normalizeList(p.applicationSteps).filter((x) => x !== item),
                                  }))
                                }
                              >
                                ✕
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="hint">
                          {/* Number the steps (e.g. 1. Visit branch, 2. Submit documents...) */}
                        </div>
                      )}
                    </div>

                    {/* ==================== CATEGORY-SPECIFIC SECTIONS ==================== */}
                    <div className="notice">
                      {/* <div className="noticeTitle">Category-specific details (changes with tabs)</div> */}
                    </div>

                    {/* LOANS */}
                    {productDraft.category === 'Loans' && (
                      <>
                        <div className="grid three">
                          <label className="field">
                            <span className="label">Interest rate (APR %)</span>
                            <input
                              value={productDraft.interestRateApr}
                              type='number'
                              onChange={(e) => setProductDraft((p) => ({ ...p, interestRateApr: e.target.value }))}
                              placeholder="e.g. 18"
                              inputMode="decimal"
                            />
                          </label>
                          <label className="field">
                            <span className="label">Min duration (months)</span>
                            <input
                              value={productDraft.minDurationMonths}
                              type='number'
                              onChange={(e) => setProductDraft((p) => ({ ...p, minDurationMonths: e.target.value }))}
                              placeholder="e.g. 1"
                              inputMode="numeric"
                            />
                          </label>
                          <label className="field">
                            <span className="label">Max duration (months)</span>
                            <input
                              value={productDraft.maxDurationMonths}
                              type='number'
                              onChange={(e) => setProductDraft((p) => ({ ...p, maxDurationMonths: e.target.value }))}
                              placeholder="e.g. 36"
                              inputMode="numeric"
                            />
                          </label>
                        </div>

                        <div className="grid two">
                          <label className="field">
                            <span className="label">Min amount</span>
                            <input
                              value={productDraft.minAmount}
                              type='number'
                              onChange={(e) => setProductDraft((p) => ({ ...p, minAmount: e.target.value }))}
                              placeholder="e.g. 500"
                              inputMode="decimal"
                            />
                          </label>
                          <label className="field">
                            <span className="label">Max amount</span>
                            <input
                              value={productDraft.maxAmount}
                              type='number'
                              onChange={(e) => setProductDraft((p) => ({ ...p, maxAmount: e.target.value }))}
                              placeholder="e.g. 50000"
                              inputMode="decimal"
                            />
                          </label>
                        </div>

                        <div className="grid two">
                          <label className="field">
                            <span className="label">Repayment frequency</span>
                            <select
                              value={productDraft.repaymentFrequency}
                              onChange={(e) => setProductDraft((p) => ({ ...p, repaymentFrequency: e.target.value }))}
                            >
                              <option>Weekly</option>
                              <option>Bi-weekly</option>
                              <option>Monthly</option>
                              <option>Quarterly</option>
                              <option>At maturity</option>
                            </select>
                          </label>
                          <label className="field">
                            <span className="label">Collateral / security</span>
                            <input
                              value={productDraft.collateral}
                              type='text'
                              onChange={(e) => setProductDraft((p) => ({ ...p, collateral: e.target.value }))}
                              placeholder="e.g. Payslip, guarantors"
                            />
                          </label>
                        </div>

                        <label className="field">
                          <span className="label">Processing time</span>
                          <input
                            value={productDraft.processingTime}
                            type='text'
                            onChange={(e) => setProductDraft((p) => ({ ...p, processingTime: e.target.value }))}
                            placeholder="e.g. 3-5 business days"
                          />
                          <div className="hint">How long it takes to approve the loan.</div>
                        </label>
                      </>
                    )}

                    {/* SAVINGS */}
                    {productDraft.category === 'Savings' && (
                      <>
                        <div className="grid two">
                          <label className="field">
                            <span className="label">Interest rate (APR %)</span>
                            <input
                              value={productDraft.interestRateApr}
                              type='number'
                              onChange={(e) => setProductDraft((p) => ({ ...p, interestRateApr: e.target.value }))}
                              placeholder="e.g. 5.5"
                              inputMode="decimal"
                            />
                          </label>
                          <label className="field">
                            <span className="label">Minimum balance</span>
                            <input
                              value={productDraft.minBalance}
                              type='number'
                              onChange={(e) => setProductDraft((p) => ({ ...p, minBalance: e.target.value }))}
                              placeholder="e.g. 100"
                              inputMode="decimal"
                            />
                          </label>
                        </div>

                        <label className="field">
                          <span className="label">Compounding frequency</span>
                          <select
                            value={productDraft.compoundingFrequency}
                            onChange={(e) => setProductDraft((p) => ({ ...p, compoundingFrequency: e.target.value }))}
                          >
                            <option>Daily</option>
                            <option>Weekly</option>
                            <option>Monthly</option>
                            <option>Annually</option>
                          </select>
                        </label>
                      </>
                    )}

                    {/* INSURANCE */}
                    {productDraft.category === 'Insurance' && (
                      <>
                        <div className="grid two">
                          <label className="field">
                            <span className="label">Monthly premium</span>
                            <input
                              value={productDraft.monthlyPremium}
                              type='number'
                              onChange={(e) => setProductDraft((p) => ({ ...p, monthlyPremium: e.target.value }))}
                              placeholder="e.g. 45"
                              inputMode="decimal"
                            />
                          </label>
                          <label className="field">
                            <span className="label">Coverage amount</span>
                            <input
                              value={productDraft.coverageAmount}
                              type='number'
                              onChange={(e) => setProductDraft((p) => ({ ...p, coverageAmount: e.target.value }))}
                              placeholder="e.g. 100000"
                              inputMode="decimal"
                            />
                          </label>
                        </div>

                        <label className="field">
                          <span className="label">Policy type</span>
                          <input
                            value={productDraft.policyType}
                            type='text'
                            placeholder="e.g. Business Cover"
                            onChange={(e) => setProductDraft((p) => ({ ...p, policyType: e.target.value }))}
                          />
                        </label>

                        {/* Coverage details list */}
                        <div className="field">
                          <span className="label">Coverage details</span>
                          <div className="listBuilderRow">
                            <input
                              value={coverageDetailsInput}
                              onChange={(e) => setCoverageDetailsInput(e.target.value)}
                              placeholder="e.g. Hospital bills up to E50,000"
                            />
                            <button
                              className="btn small"
                              type="button"
                              onClick={() => {
                                const next = coverageDetailsInput.trim()
                                if (!next) return
                                setProductDraft((p) => ({
                                  ...p,
                                  coverageDetails: normalizeList([...(p.coverageDetails || []), next]),
                                }))
                                setCoverageDetailsInput('')
                              }}
                            >
                              Add
                            </button>
                            <button
                              className="btn small ghost"
                              type="button"
                              onClick={() => setProductDraft((p) => ({ ...p, coverageDetails: [] }))}
                              disabled={normalizeList(productDraft.coverageDetails).length === 0}
                            >
                              Clear all
                            </button>
                          </div>
                          {normalizeList(productDraft.coverageDetails).length ? (
                            <div className="listItems">
                              {normalizeList(productDraft.coverageDetails).map((item) => (
                                <div key={item} className="listItem">
                                  <span className="listText">{item}</span>
                                  <button
                                    className="btn small ghost"
                                    type="button"
                                    onClick={() =>
                                      setProductDraft((p) => ({
                                        ...p,
                                        coverageDetails: normalizeList(p.coverageDetails).filter((x) => x !== item),
                                      }))
                                    }
                                  >
                                    ✕
                                  </button>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="hint">What is covered, limits, exclusions, etc.</div>
                          )}
                        </div>
                      </>
                    )}

                    {/* INVESTMENTS */}
                    {productDraft.category === 'Investments' && (
                      <>
                        <div className="grid two">
                          <label className="field">
                            <span className="label">Minimum investment</span>
                            <input
                              value={productDraft.minInvestment}
                              type='number'
                              onChange={(e) => setProductDraft((p) => ({ ...p, minInvestment: e.target.value }))}
                              placeholder="e.g. 5000"
                              inputMode="decimal"
                            />
                          </label>
                          <label className="field">
                            <span className="label">Expected returns (% p.a.)</span>
                            <input
                              value={productDraft.expectedReturns}
                              type='number'
                              onChange={(e) => setProductDraft((p) => ({ ...p, expectedReturns: e.target.value }))}
                              placeholder="e.g. 12"
                              inputMode="decimal"
                            />
                          </label>
                        </div>

                        <label className="field">
                          <span className="label">Risk level</span>
                          <select
                            value={productDraft.riskLevel}
                            onChange={(e) => setProductDraft((p) => ({ ...p, riskLevel: e.target.value }))}
                          >
                            <option>Low</option>
                            <option>Medium</option>
                            <option>High</option>
                          </select>
                        </label>

                        <label className="field">
                          <span className="label">Investment strategy</span>
                          <textarea
                            value={productDraft.investmentStrategy}
                            onChange={(e) => setProductDraft((p) => ({ ...p, investmentStrategy: e.target.value }))}
                            placeholder="Describe the strategy, asset allocation, etc."
                            rows={3}
                          />
                        </label>
                      </>
                    )}

                    <div className="actions">
                      <button className="btn primary" type="button" onClick={upsertProduct}>
                        {editingId ? 'Save changes' : 'Add product'}
                      </button>
                      <button className="btn" type="button" onClick={() => setView('review')}>
                        Review products
                      </button>
                      {editingId ? (
                        <button
                          className="btn ghost"
                          type="button"
                          onClick={() => {
                            setEditingId(null)
                            setProductDraft({
                              name: '',
                              category: 'Savings',
                              summary: '',
                              description: '',
                              interestRateApr: '',
                              minDurationMonths: '',
                              maxDurationMonths: '',
                              requirements: [],
                              charges: '',
                              eligibility: [],
                              repaymentFrequency: 'Monthly',
                              minAmount: '',
                              maxAmount: '',
                              collateral: '',
                            })
                            setRequirementsInput('')
                            setEligibilityInput('')
                          }}
                        >
                          Cancel edit
                        </button>
                      ) : null}
                    </div>
                  </>
                ) : view === 'review' ? (
                  <>
                    {products.length === 0 ? (
                      <div className="empty">
                        <div className="emptyTitle">No products yet</div>
                        <div className="emptyText">Add at least one product to continue.</div>
                        <button className="btn primary" type="button" onClick={() => setView('edit')}>
                          Create first product
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="productList">
                          {products.map((p) => (
                            <article key={p.id} className="productCard">
                              <div className="productTop">
                                <div>
                                  <div className="productName">{p.name}</div>
                                  <div className="productMeta">
                                    <span className="chip">{p.category}</span>
                                    {p.interestRateApr !== '' ? (
                                      <span className="chip subtle">
                                        {p.interestRateApr}% APR
                                      </span>
                                    ) : null}
                                    {p.maxDurationMonths !== '' ? (
                                      <span className="chip subtle">
                                        Up to {p.maxDurationMonths} months
                                      </span>
                                    ) : null}
                                  </div>
                                </div>
                              </div>
                              {p.summary ? <div className="productSummary">{p.summary}</div> : null}
                              <div className="productActions">
                                <button className="btn small" type="button" onClick={() => editProduct(p)}>
                                  Edit
                                </button>
                                <button
                                  className="btn small danger"
                                  type="button"
                                  onClick={() => deleteProduct(p.id)}
                                >
                                  Delete
                                </button>
                              </div>
                            </article>
                          ))}
                        </div>

                        <div className="actions">
                          <button className="btn" type="button" onClick={() => setView('edit')}>
                            Add another product
                          </button>
                          <button
                            className="btn primary"
                            type="button"
                            onClick={() => setView('submitted')}
                          >
                            Continue to submit
                          </button>
                        </div>
                      </>
                    )}
                  </>
                ) : (
                  <>
                    <div className="notice">
                      <div className="noticeTitle">Final review</div>
                      <div className="noticeText">
                        Confirm your company details and products. Once submitted, the data is synched
                        with online server. You can visit the Business Link app to check you data, after 48 hrs.
                      </div>
                    </div>

                    <div className="reviewGrid">
                      <div className="reviewPanel">
                        <div className="panelTitle">Company</div>
                        <div className="kv">
                          <div className="k">Name</div>
                          <div className="v">{draft?.company?.companyName || '—'}</div>
                          <div className="k">Email</div>
                          <div className="v">{draft?.company?.email || '—'}</div>
                          <div className="k">Coordinates</div>
                          <div className="v">
                            {Array.isArray(draft?.company?.branches) && draft.company.branches.length
                              ? draft.company.branches.map((b, i) => (
                                <div key={i}>
                                  {b?.latitude !== '' && b?.longitude !== ''
                                    ? `${b.latitude}, ${b.longitude}`
                                    : '—'}
                                </div>
                              ))
                              : draft?.company?.latitude !== '' && draft?.company?.longitude !== ''
                                ? `${draft.company.latitude}, ${draft.company.longitude}`
                                : '—'}
                          </div>
                          <div className="k">Directions</div>
                          <div className="v">
                            {Array.isArray(draft?.company?.branches) && draft.company.branches.length
                              ? draft.company.branches.map((b, i) => (
                                <div key={i}>{b?.directionsText || '—'}</div>
                              ))
                              : draft?.company?.directionsText || '—'}
                          </div>
                        </div>
                      </div>

                      <div className="reviewPanel">
                        <div className="panelTitle">Products</div>
                        <div className="panelSub">{products.length} product(s)</div>
                        <ul className="bullet">
                          {products.map((p) => (
                            <li key={p.id}>
                              <strong>{p.name}</strong>
                              {p.interestRateApr !== '' ? ` • ${p.interestRateApr}% APR` : ''}
                              {p.maxDurationMonths !== '' ? ` • up to ${p.maxDurationMonths} months` : ''}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>

                    <div className="actions">
                      <button
                        className="btn"
                        type="button"
                        onClick={() => setView('review')}
                        disabled={hasSubmitted || isSubmitting}
                      >
                        Back to review
                      </button>

                      <button
                        className="btn primary"
                        type="button"
                        onClick={submitAll}
                        disabled={hasSubmitted || products.length === 0 || isSubmitting}
                      >
                        {isSubmitting ? (
                          <ClipLoader
                            color={'#AAA'}
                            loading={isSubmitting}
                            size={10}
                            aria-label="Loading Spinner"
                            data-testid="loader"
                          />
                        )
                          : 'Submit products'}
                      </button>
                    </div>

                    {submittedAt ? (
                      <div className="notice success">
                        <div className="noticeTitle">Submitted</div>
                        <div className="noticeText">
                          Your products were submitted successfully at{' '}
                          <strong>{new Date(submittedAt).toLocaleString()}</strong>. You can see your
                          financial products from the <strong>Business Link</strong> app ➖ <strong>Smart Financing</strong>.
                        </div>
                      </div>
                    ) : null}
                  </>
                )}
              </div>
            </section>
          </section>
        )}
      </main>

      <footer className="footer">
        <div className="footerInner">
          <div className="footerBrand">
            <div className="footerLogo" aria-hidden="true">
              {indabukoLogoOk ? (
                <img
                  src={CompanyLogo}
                  alt="Indabuko"
                  onError={() => setIndabukoLogoOk(false)}
                />
              ) : (
                <svg viewBox="0 0 64 64" fill="none">
                  <path
                    d="M10 45.5V20.4c0-2.5 2-4.4 4.4-4.4h35.2c2.5 0 4.4 2 4.4 4.4v25.1c0 2.5-2 4.5-4.4 4.5H14.4C12 50 10 48 10 45.5Z"
                    stroke="currentColor"
                    strokeWidth="3"
                    opacity="0.65"
                  />
                  <path
                    d="M20 40V27.8c0-1.5 1.2-2.8 2.8-2.8h18.7c1.5 0 2.8 1.2 2.8 2.8V40"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                  />
                  <path
                    d="M23 40h18"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                  />
                  <path
                    d="M26 31.5h12"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    opacity="0.75"
                  />
                  <path
                    d="M32 12.5c4.5 1.9 7.5 5 9.3 9.3"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    opacity="0.55"
                  />
                </svg>
              )}
            </div>
            <div className="footerTitle">Indabuko Tech Crafts</div>
          </div>
          <div className="footerText">
            This portal is owned and protected by <strong>Indabuko Tech Crafts</strong>. Verified by{' '}
            <strong>ESCCOM</strong> and relevant authorities where applicable. Unauthorized access,
            modification, or misuse is prohibited.
          </div>
          <div className="footerMeta">
            <span>© {new Date().getFullYear()} Indabuko Tech Crafts</span>
            <span className="dot">•</span>
            <span>SACCO Company Product Listing Portal</span>
          </div>
        </div>
      </footer>
    </div>
  )
}

export default App
