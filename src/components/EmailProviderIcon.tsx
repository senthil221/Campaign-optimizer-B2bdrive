interface Props {
  provider: string
  size?: number
}

function providerLabel(provider: string): string {
  const normalized = provider.trim().toUpperCase()
  if (/OUTLOOK|MICROSOFT|OFFICE(?:_|\s)?365/.test(normalized)) {
    return 'Outlook'
  }
  if (/GMAIL|GOOGLE/.test(normalized)) return 'Gmail'
  return provider.trim() || 'Email provider'
}

export default function EmailProviderIcon({ provider, size = 15 }: Props) {
  const normalized = provider.trim().toUpperCase()
  const label = providerLabel(provider)
  const sharedProps = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    role: 'img',
    'aria-label': label,
    className: 'shrink-0',
  }

  if (/OUTLOOK|MICROSOFT|OFFICE(?:_|\s)?365/.test(normalized)) {
    return (
      <svg {...sharedProps}>
        <title>{label}</title>
        <path fill="#1473E6" d="M13 3h9v18h-9z" />
        <path fill="#28A8EA" d="m13 7 9-2v14l-9-2z" />
        <path fill="#0364B8" d="M2 6.5 14 4v16L2 17.5z" />
        <path
          fill="#fff"
          d="M8.1 9c-2 0-3.2 1.4-3.2 3.2s1.2 3.1 3.1 3.1 3.2-1.4 3.2-3.2S10 9 8.1 9Zm0 1.5c.9 0 1.4.7 1.4 1.7s-.5 1.7-1.4 1.7-1.4-.7-1.4-1.7.5-1.7 1.4-1.7Z"
        />
      </svg>
    )
  }

  if (/GMAIL|GOOGLE/.test(normalized)) {
    return (
      <svg {...sharedProps}>
        <title>{label}</title>
        <path fill="#4285F4" d="M3 19V7.4l3 2.25V19z" />
        <path fill="#34A853" d="M18 19V9.65l3-2.25V19z" />
        <path fill="#EA4335" d="M3.5 5.4c.9-.7 1.8-.5 2.5 0l6 4.5 6-4.5c.8-.6 1.8-.7 2.5 0L12 12z" />
        <path fill="#FBBC04" d="M18 9.65 21 7.4V6.5c0-.5-.2-.9-.5-1.1L18 7.25z" />
        <path fill="#C5221F" d="M3 7.4 6 9.65v-2.4L3.5 5.4c-.3.2-.5.6-.5 1.1z" />
      </svg>
    )
  }

  return (
    <svg {...sharedProps}>
      <title>{label}</title>
      <rect
        x="2.5"
        y="5"
        width="19"
        height="14"
        rx="2.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="m4 7 8 6 8-6"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  )
}

export function EmailProviderIcons({
  providers,
  size = 15,
}: {
  providers: string[]
  size?: number
}) {
  if (providers.length === 0) return null
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 text-faint"
      title={providers.join(', ')}
    >
      {providers.map((provider) => (
        <EmailProviderIcon key={provider} provider={provider} size={size} />
      ))}
    </span>
  )
}
