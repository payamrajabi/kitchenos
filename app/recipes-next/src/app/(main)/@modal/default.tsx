// Default content for the `modal` parallel-route slot. Next.js requires a
// default for every parallel slot so that navigating to a route that does NOT
// match an intercepting modal route still renders cleanly. Returning null here
// means: "no modal on top right now."
export default function ModalSlotDefault() {
  return null;
}
