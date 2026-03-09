'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ResumeUpload } from '@/components/ui/resume-upload'
import { CANDIDATE_SOURCE } from '@/lib/status-config'

interface CandidateFormData {
  firstName: string
  lastName: string
  email: string
  phone: string
  linkedinUrl: string
  currentCompany: string
  location: string
  source: string
  notes: string
  resumeKey: string | null
  resumeName: string | null
}

interface CandidateFormProps {
  initialData?: Partial<CandidateFormData>
  candidateId?: string
  mode: 'create' | 'edit'
}

export function CandidateForm({ initialData, candidateId, mode }: CandidateFormProps) {
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [formData, setFormData] = useState<CandidateFormData>({
    firstName: initialData?.firstName || '',
    lastName: initialData?.lastName || '',
    email: initialData?.email || '',
    phone: initialData?.phone || '',
    linkedinUrl: initialData?.linkedinUrl || '',
    currentCompany: initialData?.currentCompany || '',
    location: initialData?.location || '',
    source: initialData?.source || '',
    notes: initialData?.notes || '',
    resumeKey: initialData?.resumeKey ?? null,
    resumeName: initialData?.resumeName ?? null,
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    setError(null)

    const payload = {
      ...formData,
      source: formData.source || null,
      resumeKey: formData.resumeKey,
      resumeName: formData.resumeName,
    }

    try {
      const url = mode === 'create' ? '/api/candidates' : `/api/candidates/${candidateId}`
      const method = mode === 'create' ? 'POST' : 'PATCH'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to save candidate')
      }

      const data = await res.json()
      const candidate = data.candidate || data
      router.push(`/candidates/${candidate.id}`)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setIsSubmitting(false)
    }
  }

  const updateField = <K extends keyof CandidateFormData>(field: K, value: CandidateFormData[K]) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
      {error && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="firstName">First Name *</Label>
            <Input
              id="firstName"
              value={formData.firstName}
              onChange={(e) => updateField('firstName', e.target.value)}
              placeholder="e.g. John"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="lastName">Last Name *</Label>
            <Input
              id="lastName"
              value={formData.lastName}
              onChange={(e) => updateField('lastName', e.target.value)}
              placeholder="e.g. Doe"
              required
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) => updateField('email', e.target.value)}
              placeholder="e.g. john@example.com"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">Phone</Label>
            <Input
              id="phone"
              type="tel"
              value={formData.phone}
              onChange={(e) => updateField('phone', e.target.value)}
              placeholder="e.g. +1 (555) 123-4567"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="linkedinUrl">LinkedIn URL</Label>
          <Input
            id="linkedinUrl"
            type="url"
            value={formData.linkedinUrl}
            onChange={(e) => updateField('linkedinUrl', e.target.value)}
            placeholder="e.g. https://linkedin.com/in/johndoe"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="currentCompany">Current Company</Label>
            <Input
              id="currentCompany"
              value={formData.currentCompany}
              onChange={(e) => updateField('currentCompany', e.target.value)}
              placeholder="e.g. Acme Inc"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="location">Location</Label>
            <Input
              id="location"
              value={formData.location}
              onChange={(e) => updateField('location', e.target.value)}
              placeholder="e.g. San Francisco, CA"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Source</Label>
          <Select
            value={formData.source}
            onValueChange={(value) => updateField('source', value ?? '')}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select source" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">Not specified</SelectItem>
              {Object.entries(CANDIDATE_SOURCE).map(([key, config]) => (
                <SelectItem key={key} value={key}>
                  {config.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="notes">Notes</Label>
          <textarea
            id="notes"
            value={formData.notes}
            onChange={(e) => updateField('notes', e.target.value)}
            placeholder="Additional notes about the candidate..."
            rows={4}
            className="flex w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
          />
        </div>

        <div className="space-y-2">
          <Label>Resume</Label>
          <ResumeUpload
            currentResume={formData.resumeKey && formData.resumeName ? { key: formData.resumeKey, name: formData.resumeName } : null}
            onUploadComplete={(key, name) => {
              setFormData(prev => ({ ...prev, resumeKey: key, resumeName: name }))
            }}
            onError={(err) => setError(err)}
            disabled={isSubmitting}
          />
        </div>
      </div>

      <div className="flex gap-3">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Saving...' : mode === 'create' ? 'Create Candidate' : 'Save Changes'}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
          disabled={isSubmitting}
        >
          Cancel
        </Button>
      </div>
    </form>
  )
}
