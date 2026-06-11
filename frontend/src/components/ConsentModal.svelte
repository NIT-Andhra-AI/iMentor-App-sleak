<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import { acceptConsent, declineConsent } from "../lib/tauri";

  const dispatch = createEventDispatcher<{ accepted: void; declined: void }>();
  let expanded = false;
  let busy = false;

  async function handleAccept() {
    busy = true;
    try {
      await acceptConsent();
      dispatch("accepted");
    } catch (e) {
      console.error(e);
      busy = false; // re-enable buttons so user can retry
    }
  }
  async function handleDecline() {
    busy = true;
    try {
      await declineConsent();
      dispatch("declined");
    } catch (e) {
      console.error(e);
      busy = false;
    }
  }
</script>

<div class="overlay">
  <div class="modal">
    <!-- Header -->
    <div class="modal-header">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#60a5fa"
           stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
      </svg>
      <div>
        <h2>Terms &amp; Privacy Notice</h2>
        <p class="sub">Please read carefully before continuing — Student AI v1.0 End-User License Agreement</p>
      </div>
    </div>

    <!-- Toggle full EULA -->
    <div class="eula-toggle">
      <button on:click={() => (expanded = !expanded)}>
        {expanded ? "▲ Hide" : "▼ Show"} full End-User License Agreement
      </button>
    </div>

    {#if expanded}
      <div class="eula-text">
        <pre>
STUDENT AI — END-USER LICENSE AGREEMENT
Version 1.0  |  Effective Date: 11 May 2026
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

PLEASE READ THIS AGREEMENT CAREFULLY BEFORE INSTALLING OR USING
STUDENT AI. BY CLICKING "I AGREE — ACCEPT & CONTINUE", INSTALLING,
COPYING, OR OTHERWISE USING THE SOFTWARE, YOU ACKNOWLEDGE THAT YOU
HAVE READ, UNDERSTOOD, AND AGREE TO BE BOUND BY ALL TERMS AND
CONDITIONS OF THIS AGREEMENT.  IF YOU DO NOT AGREE, CLICK "DECLINE
& CONTINUE WITHOUT TELEMETRY" AND UNINSTALL THE SOFTWARE IMMEDIATELY.

─────────────────────────────────────────────────────────────────
1. DEFINITIONS
─────────────────────────────────────────────────────────────────
"Agreement"  means this End-User License Agreement and all schedules
             attached hereto.
"Developer"  means the individual or entity that developed and
             distributed Student AI.
"Software"   means the Student AI desktop application, including all
             bundled AI models, course materials, binary executables,
             documentation, and updates thereto.
"User" / "You" means the individual who installs or uses the Software.
"Personal Data" has the meaning assigned under the Digital Personal
             Data Protection Act, 2023 (India) ("DPDP Act") and the
             Information Technology Act, 2000 (as amended in 2008)
             ("IT Act").
"AI Model"   means the large-language model (LLM) binary bundled with
             or downloaded by the Software.

─────────────────────────────────────────────────────────────────
2. GRANT OF LICENCE
─────────────────────────────────────────────────────────────────
2.1  Subject to the terms herein, the Developer grants You a limited,
     non-exclusive, non-transferable, non-sublicensable, revocable
     licence to install and use one (1) copy of the Software on a
     single device owned or controlled by You, solely for personal,
     non-commercial educational purposes.
2.2  This licence does not include the right to: (a) distribute,
     sublicense, or resell the Software; (b) use the Software for
     commercial AI inference services; (c) deploy the Software on
     shared infrastructure accessible to third parties.

─────────────────────────────────────────────────────────────────
3. RESTRICTIONS
─────────────────────────────────────────────────────────────────
You shall NOT:
(a) Copy, modify, translate, adapt, merge, or create derivative works
    of the Software or the bundled AI Model except as permitted by
    applicable law;
(b) Reverse-engineer, decompile, disassemble, or attempt to extract
    source code of the Software or the AI Model, except to the extent
    expressly permitted by applicable law notwithstanding this
    limitation;
(c) Remove, alter, or obscure any proprietary notices, labels, or
    marks on the Software;
(d) Use the Software in any manner that violates the IT Act, 2000,
    the Information Technology (Intermediary Guidelines and Digital
    Media Ethics Code) Rules, 2021, the DPDP Act, 2023, or any other
    applicable Indian or international law;
(e) Use the Software to generate, distribute, or store content that
    is obscene, defamatory, hateful, or otherwise unlawful under the
    Indian Penal Code, 1860, or the Bharatiya Nyaya Sanhita, 2023;
(f) Attempt to circumvent any technical protection measures or
    licence expiry mechanisms embedded in the Software.

─────────────────────────────────────────────────────────────────
4. AI-GENERATED CONTENT — DISCLAIMER & ACCEPTABLE USE
─────────────────────────────────────────────────────────────────
4.1  The AI Model generates responses based on statistical patterns
     and may produce inaccurate, incomplete, outdated, or misleading
     information ("Hallucinations").  All AI-generated content must
     be independently verified against authoritative academic or
     professional sources before reliance.
4.2  The Developer makes NO representation that AI-generated content
     is accurate, fit for any particular academic purpose, or free
     from errors.  Students are solely responsible for verifying
     answers against their institution's course materials and
     obtaining guidance from qualified instructors.
4.3  Submission of AI-generated text as original academic work may
     constitute academic misconduct under your institution's policies.
     You accept full responsibility for complying with your
     institution's academic integrity policies.
4.4  The Software shall not be used to generate content that
     constitutes cheating, plagiarism, fraud, or any violation of
     applicable educational regulations.

─────────────────────────────────────────────────────────────────
5. DATA PRIVACY AND TELEMETRY
─────────────────────────────────────────────────────────────────
5.1  Local AI Processing.  All AI inference is performed exclusively
  on your local device using the bundled GGUF model.  AI-generated
  responses are never transmitted to any server.  With your consent,
  de-identified user message text (with PII stripped on-device prior
  to transmission) may be included in usage telemetry as described in
  Clause 5.2.  Documents uploaded for RAG search are processed
  locally only and are never transmitted to any server.
5.2  Optional Telemetry.  With your consent, the Software may
     transmit strictly de-identified, aggregated usage statistics
     (session mode, latency metrics, hardware class) to assist the
     Developer in improving the Software.  No Personally Identifiable
     Information ("PII") as defined under the DPDP Act is collected.
5.3  Data Minimisation & On-Device PII Stripping.  Before any data
  leaves your device, the application automatically redacts:
  e-mail addresses, phone numbers, student/employee ID numbers,
  personal names preceded by titles (Mr/Mrs/Ms/Dr/Prof), SSN-like
  patterns, and URLs.  Each substitution is replaced with a tag
  (e.g. [EMAIL], [PHONE]).  AI response text is never transmitted;
  only its SHA-256 digest is included.  Transmitted telemetry
  payloads contain: session mode, time-to-first-token (ms), message
  count, app version, a SHA-256 hash of the session identifier, and
  de-identified message text.  IP addresses, hostnames, and MAC
  addresses are never collected.
5.4  Consent and Withdrawal.  Your consent to telemetry is freely
     given, specific, and revocable.  You may withdraw consent at any
     time via Settings → Privacy without any detriment to the core
     functionality of the Software.
5.5  Retention.  The Developer's server-side policy is to retain
  de-identified telemetry data for a maximum of twelve (12) months
  from the date of receipt, after which it is permanently deleted.
  This is a server-side commitment; the application itself does not
  enforce deletion on the Developer's servers.
5.6  Compliance.  The Developer processes data in accordance with the
     Digital Personal Data Protection Act, 2023 (India), the
     Information Technology Act, 2000, and the IT (Amendment) Act,
     2008.  Data principals may exercise rights of access, correction,
     and erasure by contacting the Grievance Officer identified in
     Clause 11.
5.7  Third-Party AI Model Weights.  The bundled AI model weights are
     sourced from publicly available repositories (e.g., HuggingFace)
     under their respective open-source licences.  The Developer makes
     no warranty as to the quality, bias, or fitness of third-party
     model weights.

─────────────────────────────────────────────────────────────────
6. INTELLECTUAL PROPERTY
─────────────────────────────────────────────────────────────────
6.1  The Software, including its source code, UI design, course
     content, documentation, and all associated intellectual property
     rights, are owned by or licensed to the Developer and are
     protected under the Copyright Act, 1957 (India), the Patents
     Act, 1970 (India), and applicable international treaties.
6.2  This Agreement does not transfer any ownership of intellectual
     property to You.  All rights not expressly granted are reserved
     by the Developer.
6.3  Third-party open-source components are governed by their
     respective licences (MIT, Apache-2.0, etc.).  A notice of
     such licences is available in the Software's documentation.

─────────────────────────────────────────────────────────────────
7. DISCLAIMER OF WARRANTIES
─────────────────────────────────────────────────────────────────
7.1  THE SOFTWARE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT
     WARRANTY OF ANY KIND, WHETHER EXPRESS, IMPLIED, OR STATUTORY.
     TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, THE DEVELOPER
     EXPRESSLY DISCLAIMS ALL WARRANTIES, INCLUDING BUT NOT LIMITED TO:
     (a) IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
         PARTICULAR PURPOSE, AND NON-INFRINGEMENT;
     (b) THAT THE SOFTWARE WILL MEET YOUR REQUIREMENTS OR OPERATE
         UNINTERRUPTED, ERROR-FREE, OR SECURELY;
     (c) THAT DEFECTS WILL BE CORRECTED;
     (d) THAT THE SOFTWARE IS FREE FROM VIRUSES OR OTHER HARMFUL
         COMPONENTS;
     (e) THE ACCURACY, COMPLETENESS, OR RELIABILITY OF ANY
         AI-GENERATED CONTENT.
7.2  No oral or written statement by the Developer, its agents, or
     representatives shall create any warranty not expressly stated
     in this Agreement.

─────────────────────────────────────────────────────────────────
8. LIMITATION OF LIABILITY
─────────────────────────────────────────────────────────────────
8.1  TO THE MAXIMUM EXTENT PERMITTED UNDER APPLICABLE INDIAN LAW,
     IN NO EVENT SHALL THE DEVELOPER, ITS DIRECTORS, OFFICERS,
     EMPLOYEES, AGENTS, CONTRACTORS, OR LICENSORS BE LIABLE FOR:
     (a) ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, PUNITIVE,
         OR EXEMPLARY DAMAGES;
     (b) LOSS OF DATA, PROFITS, GOODWILL, BUSINESS OPPORTUNITIES,
         OR ANTICIPATED SAVINGS;
     (c) DAMAGE TO HARDWARE, SOFTWARE, OR OTHER PROPERTY;
     (d) LOSS RESULTING FROM RELIANCE ON AI-GENERATED CONTENT;
     (e) ACADEMIC PENALTIES, INSTITUTIONAL DISCIPLINARY ACTION, OR
         PROFESSIONAL CONSEQUENCES ARISING FROM YOUR USE OF THE
         SOFTWARE;
     (f) UNAUTHORISED ACCESS TO OR ALTERATION OF YOUR TRANSMISSIONS
         OR DATA,
     WHETHER BASED ON WARRANTY, CONTRACT, TORT (INCLUDING NEGLIGENCE),
     STRICT LIABILITY, OR ANY OTHER LEGAL THEORY, EVEN IF THE
     DEVELOPER HAS BEEN ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.
8.2  SECURITY BREACHES.  The Developer implements reasonable
     industry-standard technical safeguards; however, THE DEVELOPER
     IS NOT LIABLE FOR ANY SECURITY BREACH, UNAUTHORISED ACCESS,
     DATA THEFT, OR CYBERATTACK AFFECTING YOUR DEVICE OR DATA,
     INCLUDING BUT NOT LIMITED TO INCIDENTS ATTRIBUTABLE TO THIRD-
     PARTY MALWARE, NETWORK VULNERABILITIES, OR ZERO-DAY EXPLOITS.
     You are responsible for maintaining the security of your device
     and operating environment.
8.3  The Developer's aggregate liability for all claims arising out
     of or relating to this Agreement shall not exceed INR 0
     (zero rupees), as the Software is provided to You free of charge.

─────────────────────────────────────────────────────────────────
9. INDEMNIFICATION
─────────────────────────────────────────────────────────────────
You agree to indemnify, defend, and hold harmless the Developer and
its affiliates, officers, agents, and successors from and against
any claims, liabilities, damages, losses, penalties, and expenses
(including reasonable legal fees) arising out of or relating to:
(a) Your use or misuse of the Software;
(b) Your violation of this Agreement or any applicable law, including
    the IT Act, DPDP Act, or any other statute;
(c) Your infringement of any third-party intellectual property or
    privacy rights;
(d) Any academic integrity violation resulting from your use of
    AI-generated content.

─────────────────────────────────────────────────────────────────
10. TERM AND TERMINATION
─────────────────────────────────────────────────────────────────
10.1  This Agreement is effective from the date you first install or
      use the Software and continues until terminated.
10.2  This licence terminates automatically and without notice if you
      breach any term herein.  Upon termination, you must immediately
      cease using the Software and destroy all copies in your
      possession.
10.3  This Software contains a built-in licence expiry mechanism.
      Upon expiry, the Software will cease to function and may
      uninstall itself together with associated user data after a
      grace period disclosed at launch.
10.4  Sections 3, 4, 6, 7, 8, 9, 10, and 12 survive termination.

─────────────────────────────────────────────────────────────────
11. GRIEVANCE OFFICER (IT ACT, 2000 — RULE 5(9))
─────────────────────────────────────────────────────────────────
In accordance with the Information Technology Act, 2000 and the IT
(Intermediary Guidelines and Digital Media Ethics Code) Rules, 2021,
the designated Grievance Officer for Student AI is:

  Name   : Developer Support Team
  E-mail : grievance@studentai.example.com
  Address: [Registered address of Developer], India

Grievances will be acknowledged within 24 hours and resolved within
15 days of receipt.  Data principal requests under the DPDP Act, 2023
(access, correction, erasure) should also be directed to the above.

─────────────────────────────────────────────────────────────────
12. GOVERNING LAW AND DISPUTE RESOLUTION
─────────────────────────────────────────────────────────────────
12.1  This Agreement is governed by and construed in accordance with
      the laws of the Republic of India, without regard to its
      conflict-of-law provisions.
12.2  Any dispute, controversy, or claim arising out of or relating to
      this Agreement or the Software shall first be subject to good-
      faith negotiation.  If unresolved within thirty (30) days, the
      dispute shall be submitted to binding arbitration in accordance
      with the Arbitration and Conciliation Act, 1996 (India).
12.3  The seat of arbitration shall be [City], India.  The language
      of arbitration shall be English.  The arbitral award shall be
      final and binding on both parties.
12.4  Nothing herein prevents either party from seeking urgent
      injunctive relief from a competent court of jurisdiction.

─────────────────────────────────────────────────────────────────
13. GENERAL PROVISIONS
─────────────────────────────────────────────────────────────────
13.1  Entire Agreement.  This Agreement constitutes the entire
      agreement between You and the Developer with respect to the
      Software and supersedes all prior agreements, representations,
      and understandings.
13.2  Severability.  If any provision of this Agreement is held
      invalid or unenforceable, the remaining provisions shall
      continue in full force and effect.
13.3  No Waiver.  Failure to enforce any provision shall not
      constitute a waiver of future enforcement.
13.4  Updates.  The Developer may update this Agreement with
      reasonable prior notice.  Continued use of the Software after
      notice of changes constitutes acceptance of the revised terms.
13.5  Export Compliance.  You agree to comply with all applicable
      export control laws, including those of India and any country
      in which you access the Software.
13.6  Minors.  If you are under 18 years of age, you represent that
      your parent or legal guardian has reviewed and consented to
      this Agreement on your behalf as required by the DPDP Act, 2023.

─────────────────────────────────────────────────────────────────
CONTACT & NOTICES
─────────────────────────────────────────────────────────────────
  Privacy queries  : privacy@studentai.example.com
  Grievance Officer: grievance@studentai.example.com
  General support  : support@studentai.example.com

© 2026 Student AI Developer.  All rights reserved.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━</pre>
      </div>
    {/if}

    <!-- Actions -->
    <div class="actions">
      <button class="btn-secondary" on:click={handleDecline} disabled={busy}>
        Decline &amp; continue without telemetry
      </button>
      <button class="btn-primary" on:click={handleAccept} disabled={busy}>
        I Agree — Accept &amp; Continue
      </button>
    </div>
  </div>
</div>

<style>
  .overlay {
    position:fixed; inset:0; z-index:50;
    display:flex; align-items:center; justify-content:center;
    background:rgba(0,0,0,.7); backdrop-filter:blur(4px); padding:16px;
  }
  .modal {
    background:#16181c; border:1px solid #2a2d35; border-radius:16px;
    box-shadow:0 24px 64px rgba(0,0,0,.6);
    width:100%; max-width:640px; display:flex; flex-direction:column; max-height:90vh;
    overflow:hidden;
  }
  .modal-header {
    display:flex; align-items:center; gap:12px;
    padding:24px 24px 16px; border-bottom:1px solid #2a2d35;
  }
  h2 { font-size:17px; font-weight:600; color:#fff; }
  .sub { font-size:11px; color:#8b949e; margin-top:2px; }
  .eula-toggle { padding:0 24px 8px; }
  .eula-toggle button {
    background:none; border:none; color:#60a5fa; font-size:11px;
    cursor:pointer; text-decoration:none;
  }
  .eula-toggle button:hover { color:#93c5fd; }
  .eula-text {
    margin:0 24px 8px; border-radius:8px; border:1px solid #2a2d35;
    background:#0d0e10; overflow-y:auto; max-height:280px;
  }
  pre {
    padding:16px; font-size:10px; color:#8b949e;
    white-space:pre-wrap; font-family:monospace; line-height:1.6;
  }
  .actions {
    padding:12px 24px 24px; display:flex; gap:12px; justify-content:flex-end;
    border-top:1px solid #2a2d35; margin-top:8px;
  }
  .btn-primary, .btn-secondary {
    display:flex; align-items:center; gap:8px;
    padding:8px 18px; border-radius:8px; font-size:13px; font-weight:500;
    border:none; cursor:pointer; transition:background .15s;
  }
  .btn-primary  { background:#2563eb; color:#fff; }
  .btn-primary:hover  { background:#3b82f6; }
  .btn-secondary { background:transparent; color:#8b949e; border:1px solid #2a2d35; }
  .btn-secondary:hover { background:#2a2d35; color:#fff; }
  button:disabled { opacity:.5; cursor:not-allowed; }
</style>
