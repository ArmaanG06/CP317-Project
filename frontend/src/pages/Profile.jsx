import { ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "../api";
import Banner from "../components/Banner";
import Button from "../components/Button";
import Field from "../components/Field";
import usePageTitle from "../lib/usePageTitle";

// Options mirror SEX_OPTIONS and PROVINCES in backend/app/profiles.py. The server re-checks everything.
const SEX = [
  { value: "female", label: "Female" },
  { value: "male", label: "Male" },
  { value: "intersex", label: "Intersex" },
];
const PROVINCES = [
  ["AB", "Alberta"], ["BC", "British Columbia"], ["MB", "Manitoba"], ["NB", "New Brunswick"],
  ["NL", "Newfoundland and Labrador"], ["NS", "Nova Scotia"], ["NT", "Northwest Territories"],
  ["NU", "Nunavut"], ["ON", "Ontario"], ["PE", "Prince Edward Island"], ["QC", "Quebec"],
  ["SK", "Saskatchewan"], ["YT", "Yukon"],
].map(([value, label]) => ({ value, label }));
const GENDER_SUGGESTIONS = ["Woman", "Man", "Non-binary", "Two-Spirit", "Prefer not to say"];

const SECTIONS = [
  {
    title: "Personal details",
    fields: [
      { k: "legal_name", label: "Full legal name", autoComplete: "name", hint: "As it appears on your health card." },
      { k: "preferred_name", label: "Preferred name (optional)", autoComplete: "nickname", hint: "What you'd like your care team to call you." },
      { k: "date_of_birth", label: "Date of birth", type: "date", autoComplete: "bday" },
      { k: "sex", label: "Sex", options: SEX, hint: "Used for clinical reference ranges." },
      { k: "gender", label: "Gender (optional)", list: "gender-suggestions", hint: "How you identify. Choose a suggestion or type your own." },
    ],
  },
  {
    title: "Address",
    fields: [
      { k: "address_line1", label: "Street address", autoComplete: "address-line1" },
      { k: "address_line2", label: "Apartment, suite or unit (optional)", autoComplete: "address-line2" },
      { k: "city", label: "City", autoComplete: "address-level2" },
      { k: "province", label: "Province or territory", options: PROVINCES, autoComplete: "address-level1" },
      { k: "postal_code", label: "Postal code", autoComplete: "postal-code", hint: "For example, N2L 3C5." },
    ],
  },
  {
    title: "Contact information",
    fields: [
      { k: "phone", label: "Phone number", type: "tel", autoComplete: "tel", hint: "10 digits, for example 519-555-0123." },
      { k: "emergency_contact_name", label: "Emergency contact name (optional)" },
      { k: "emergency_contact_phone", label: "Emergency contact phone (optional)", type: "tel", hint: "Fill in both emergency contact fields, or leave both blank." },
    ],
  },
];
const FIELD_ORDER = SECTIONS.flatMap((s) => s.fields.map((f) => f.k));
const NO_ERRORS = { fields: {}, form: null };
const toValues = (data) => Object.fromEntries(FIELD_ORDER.map((k) => [k, data[k] ?? ""])); // inputs need "" not null

export default function Profile() {
  usePageTitle("My profile");
  const [values, setValues] = useState(null);
  const [email, setEmail] = useState("");
  const [loadError, setLoadError] = useState("");
  const [errors, setErrors] = useState(NO_ERRORS);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const fetchProfile = useCallback(
    () =>
      api("/profile")
        .then((data) => {
          setEmail(data.email);
          setValues(toValues(data));
        })
        .catch((e) => setLoadError(e.message)),
    []
  );

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  function reload() {
    setLoadError("");
    setErrors(NO_ERRORS);
    setSaved(false);
    fetchProfile();
  }

  const set = (k) => (e) => {
    setSaved(false);
    setValues((v) => ({ ...v, [k]: e.target.value }));
  };

  async function onSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setSaved(false);
    setErrors(NO_ERRORS);
    try {
      setValues(toValues(await api("/profile", { method: "PUT", body: values })));
      setSaved(true);
    } catch (err) {
      const next = { fields: {}, form: null };
      if (err instanceof ApiError && err.status === 422) {
        for (const { field, message } of err.fieldErrors) {
          if (field && FIELD_ORDER.includes(field)) next.fields[field] = message;
          else next.form = message;
        }
      } else {
        next.form = err.message;
      }
      setErrors(next);
      const first = FIELD_ORDER.find((k) => next.fields[k]);
      if (first) document.getElementById(`p-${first}`)?.focus(); // send keyboard users to the first problem
    } finally {
      setBusy(false);
    }
  }

  const count = Object.keys(errors.fields).length;

  return (
    <>
      <div>
        <h1 className="text-[28px] leading-9 font-bold">My profile</h1>
        <p className="text-muted">Keep your personal and contact details up to date.</p>
      </div>

      {loadError && (
        <Banner title="We couldn’t load your profile">
          {loadError}{" "}
          <Button variant="secondary" className="mt-2 h-10" onClick={reload}>Try again</Button>
        </Banner>
      )}
      {saved && <Banner tone="ok" title="Profile saved">Your details have been updated.</Banner>}
      {(count > 0 || errors.form) && (
        <Banner title={count > 0 ? `${count} ${count === 1 ? "field needs" : "fields need"} attention` : "Your profile wasn’t saved"}>
          {count > 0 ? "Nothing was saved. Fix the fields marked below, then save again." : errors.form}
          {count > 0 && errors.form && ` ${errors.form}`}
        </Banner>
      )}

      {values === null && !loadError && <p className="text-muted">Loading…</p>}

      {values && (
        <div className="grid grid-cols-[1fr_380px] items-start gap-5">
          <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
            {SECTIONS.map((section) => (
              <section key={section.title} className="flex flex-col gap-5 rounded-[20px] border border-line bg-card p-6 shadow-card">
                <h2 className="text-xl font-semibold">{section.title}</h2>
                <div className="grid grid-cols-2 gap-x-6 gap-y-5">
                  {section.fields.map(({ k, ...props }) => (
                    <Field
                      key={k}
                      id={`p-${k}`}
                      error={errors.fields[k]}
                      value={values[k]}
                      onChange={set(k)}
                      {...props}
                    />
                  ))}
                </div>
              </section>
            ))}
            <datalist id="gender-suggestions">
              {GENDER_SUGGESTIONS.map((g) => <option key={g} value={g} />)}
            </datalist>
            <div className="flex gap-3">
              <Button type="submit" loading={busy}>{busy ? "Saving…" : "Save profile"}</Button>
              <Button variant="secondary" onClick={reload} disabled={busy}>Discard changes</Button>
            </div>
          </form>

          <section className="flex flex-col gap-3 rounded-[20px] border border-line bg-card p-6 shadow-card">
            <h2 className="flex items-center gap-2.5 text-base font-semibold">
              <ShieldCheck size={24} aria-hidden="true" className="text-primary" />
              About your details
            </h2>
            <div>
              <p className="text-sm font-semibold">Sign-in email</p>
              <p className="text-muted">{email}</p>
            </div>
            <p className="text-sm text-muted">
              Only you can view or change this profile. Your care team uses these details to identify you and to
              contact you or your emergency contact if needed.
            </p>
            <p className="text-sm text-muted">
              <span className="font-semibold text-ink">Sex</span> is used for medical reference ranges.{" "}
              <span className="font-semibold text-ink">Gender</span> is how you identify, and is optional.
            </p>
          </section>
        </div>
      )}
    </>
  );
}
