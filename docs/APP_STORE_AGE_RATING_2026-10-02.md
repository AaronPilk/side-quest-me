# App Store age questionnaire verification — October 2, 2026

The release owner saved the proposed questionnaire successfully. Independent
inspection of the saved write response and relationship GET confirms
`ageRatingOverrideV2: EIGHTEEN_PLUS`. All requested booleans and all `NONE`
frequency answers match exactly. This verification made no Apple writes.

Of 25 requested attributes, 21 match exactly and four have different frequency
strings in both Apple's write response and subsequent GET:

| Attribute | Submitted | Returned |
| --- | --- | --- |
| Alcohol, tobacco or drug references | `INFREQUENT` | `INFREQUENT_OR_MILD` |
| Contests | `FREQUENT` | `FREQUENT_OR_INTENSE` |
| Profanity or crude humor | `INFREQUENT` | `INFREQUENT_OR_MILD` |
| Mature or suggestive themes | `INFREQUENT` | `INFREQUENT_OR_MILD` |

Apple's current [update-request attributes](https://developer.apple.com/documentation/appstoreconnectapi/ageratingdeclarationupdaterequest/data-data.dictionary/attributes-data.dictionary)
and [response attributes](https://developer.apple.com/documentation/appstoreconnectapi/ageratingdeclaration/attributes-data.dictionary)
document all five frequency values: `NONE`, `INFREQUENT_OR_MILD`,
`FREQUENT_OR_INTENSE`, `INFREQUENT` and `FREQUENT`. Both the submitted and returned
forms are valid documented values. The schemas do **not** explicitly state a
conversion/alias rule. The evidence therefore records the normalization
observed in this save and readback; it does not claim a formally documented
mapping or an exact attribute match. There are no other differences among the
requested attributes.

The response additionally includes deprecated `ageRatingOverride:
SEVENTEEN_PLUS`; that attribute was omitted from the request. The current V2
override is exactly `EIGHTEEN_PLUS`. Apple describes age-rating presentation as
dependent on OS generation; do not substitute the deprecated field for the
current override or treat either as verified user age. [Apple age-rating definitions](https://developer.apple.com/help/app-store-connect/reference/app-information/age-ratings-values-and-definitions)

Local evidence is stored outside version control:

- `.local/app-store-metadata/age-rating-proposed-request.json`
- `.local/app-store-metadata/age-rating-write.json`
- `.local/app-store-metadata/age-rating-readback.json`
- `.local/app-store-metadata/age-rating-verification.json`

The sanitized verification records field-level differences, request/response
schema URLs, evidence hashes and the precise limits of the comparison. Saving
this questionnaire does not submit the app, publish App Privacy answers or
establish Apple approval.
