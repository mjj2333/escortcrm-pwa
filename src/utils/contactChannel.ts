import type { Client, ContactMethod } from '../types'

export const contactMethodMeta: Record<ContactMethod, { label: string; color: string }> = {
  'Phone':    { label: 'Phone',    color: '#6b7280' },
  'Text':     { label: 'Text',     color: '#22c55e' },
  'Email':    { label: 'Email',    color: '#3b82f6' },
  'Telegram': { label: 'Telegram', color: '#0088cc' },
  'Signal':   { label: 'Signal',   color: '#3a76f0' },
  'WhatsApp': { label: 'WhatsApp', color: '#25d366' },
  'Other':    { label: 'Other',    color: '#6b7280' },
}

export function getContactValue(client: Client, method: ContactMethod): string | undefined {
  switch (method) {
    case 'Phone': case 'Text': return client.phone
    case 'Email': return client.email
    case 'Telegram': return client.telegram || client.phone
    case 'Signal': return client.signal || client.phone
    case 'WhatsApp': return client.whatsapp || client.phone
    case 'Other': return client.phone || client.email
  }
}

export function openChannel(method: ContactMethod, contactValue: string, message: string): 'opened' | 'copied' {
  const encoded = encodeURIComponent(message)

  switch (method) {
    case 'Text':
    case 'Phone': {
      const sep = /iPhone|iPad|iPod/.test(navigator.userAgent) ? '&' : '?'
      window.open(`sms:${contactValue}${sep}body=${encoded}`, '_blank')
      return 'opened'
    }
    case 'Email': {
      window.open(`mailto:${contactValue}?subject=${encodeURIComponent('Introduction')}&body=${encoded}`, '_blank')
      return 'opened'
    }
    case 'WhatsApp': {
      const phone = contactValue.replace(/[^0-9]/g, '')
      window.open(`https://wa.me/${phone}?text=${encoded}`, '_blank')
      return 'opened'
    }
    case 'Telegram': {
      if (contactValue.startsWith('@') || !/^\+?\d+$/.test(contactValue)) {
        const username = contactValue.replace('@', '')
        window.open(`https://t.me/${username}?text=${encoded}`, '_blank')
      } else {
        window.open(`https://t.me/+${contactValue.replace(/[^0-9]/g, '')}?text=${encoded}`, '_blank')
      }
      return 'opened'
    }
    default: {
      navigator.clipboard.writeText(message).catch(() => {})
      return 'copied'
    }
  }
}
