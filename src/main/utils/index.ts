export function slotStringToNumber(slot: string): number {
  return parseInt(slot.substring(1));
}

export function slotNumberToString(slotNumber: number): string {
  return `c${slotNumber.toString().padStart(2, '0')}`;
}
