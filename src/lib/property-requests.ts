/**
 * Shared facts about the property request flow.
 *
 * The auto-reject reason lives here rather than in the route because the
 * weekly summary has to recognise it: when one request is approved the app
 * rejects the rival requests with this exact sentence, and counting those as
 * real rejections would make the team look far more negative than it is.
 * Two copies of the string would drift and the report would quietly go wrong.
 */
export const AUTO_REJECT_REASON = "Another request for this property was approved.";
