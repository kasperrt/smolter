export const marker = "discovered module";

export function meta() {
  return [{ title: "Discovered" }];
}

export function unlisted() {
  return "not selected";
}

export default function Discovered() {
  return marker;
}
