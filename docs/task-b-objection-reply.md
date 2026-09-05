# Task B — Reply to Jordan S. (Acme Health Apps)

> Format note: written as a Slack/async-message reply, ~260 words.

---

Hey Jordan — fair question, and I'd ask the same thing before signing up for a vendor.

Building direct SMART on FHIR against Epic specifically is genuinely not that bad — Epic's docs and sandbox are solid, and if your patient base were 100% Epic, I'd tell you honestly that owning that one integration yourself is a reasonable call. The economics change once you say "and a handful of smaller regional EHRs." That's where the real cost lives, and it's not the initial OAuth handshake — it's everything after go-live: each vendor (and often each health system's specific instance) has its own quirks in how it populates FHIR resources, its own token refresh and revocation behavior, its own pace of certification/recert cycles, and its own way of silently drifting out of spec compliance. You'll be debugging "why is this one hospital's AllergyIntolerance resource missing a field we depend on" forever, multiplied by however many EHRs you connect to.

That long tail is what we've already absorbed — normalization across those quirks, consent lifecycle management (not just "can we pull data" but "did the patient actually authorize it, and what happens when they revoke or switch providers"), and TEFCA/HIE connections that get you data sources beyond what any single EHR vendor exposes. You're not paying us for convenience on the Epic connection you could build yourself — you're paying us to not be the ones who have to maintain the other 90% of the integration surface as it grows.

So: if you're staying Epic-only indefinitely and have the eng bandwidth to own that forever, building direct isn't crazy. If "handful of smaller regional EHRs" is going to keep growing, that's exactly the scenario where the maintenance tax compounds and where we're built to absorb it instead of you. Happy to walk through our normalization layer or consent model in more detail if useful.
