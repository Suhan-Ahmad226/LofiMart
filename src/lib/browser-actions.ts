'use client';

export async function copyText(value: string): Promise<boolean> {
  if (typeof navigator === 'undefined' || !value) {
    return false;
  }

  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    if (typeof document === 'undefined') {
      return false;
    }

    try {
      const textArea = document.createElement('textarea');
      textArea.value = value;
      textArea.setAttribute('readonly', 'true');
      textArea.style.position = 'fixed';
      textArea.style.opacity = '0';
      textArea.style.pointerEvents = 'none';
      document.body.appendChild(textArea);
      textArea.select();
      textArea.setSelectionRange(0, textArea.value.length);
      const copied = document.execCommand('copy');
      document.body.removeChild(textArea);
      return copied;
    } catch {
      return false;
    }
  }
}

export function openMailto(email: string, subject?: string) {
  if (typeof window === 'undefined' || !email) {
    return;
  }

  const target = subject
    ? `mailto:${email}?subject=${encodeURIComponent(subject)}`
    : `mailto:${email}`;

  window.location.href = target;
}

export function openPrintDocument(html: string, features = 'width=760,height=900'): boolean {
  if (typeof window === 'undefined' || typeof document === 'undefined' || !html) {
    return false;
  }

  const nextWindow = window.open('', '_blank', features);
  if (!nextWindow) {
    return false;
  }

  nextWindow.document.write(html);
  nextWindow.document.close();
  nextWindow.focus();
  nextWindow.print();
  return true;
}
