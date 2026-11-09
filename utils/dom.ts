/** The current value of the input, select or textarea an event came from */
export function inputValue(e: Event): string {
  return (e.target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).value
}
