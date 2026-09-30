import React, { useEffect, useState } from 'react';
import { Mail, Phone, MapPin, Send, MessageSquare, Loader2 } from 'lucide-react';
import toast from '@/lib/toast';
import { useNavigate, useSearchParams } from '../../../lib/navigation';
import { FormNotice } from '@/features/shared/ui/FeedbackState';

export const ContactPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const urlSubject = searchParams.get('subject') || '';
  const urlMessage = searchParams.get('message') || '';
  const urlEmail = searchParams.get('email') || '';
  const urlFirstName = searchParams.get('firstName') || '';
  const urlLastName = searchParams.get('lastName') || '';
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [submitSuccess, setSubmitSuccess] = useState('');
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    subject: 'General Inquiry',
    message: '',
  });

  const handleChange = (field: keyof typeof formData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setValidationErrors((prev) => ({ ...prev, [field]: '' }));
  };

  useEffect(() => {
    if (!urlSubject && !urlMessage && !urlEmail && !urlFirstName && !urlLastName) return;

    setFormData((current) => ({
      ...current,
      subject: urlSubject || current.subject,
      message: urlMessage || current.message,
      email: urlEmail || current.email,
      firstName: urlFirstName || current.firstName,
      lastName: urlLastName || current.lastName,
    }));
  }, [urlEmail, urlFirstName, urlLastName, urlMessage, urlSubject]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError('');
    setSubmitSuccess('');

    const nextErrors: Record<string, string> = {};
    const fullName = `${formData.firstName} ${formData.lastName}`.trim();

    if (!formData.firstName.trim()) nextErrors.firstName = 'First name is required.';
    if (!formData.lastName.trim()) nextErrors.lastName = 'Last name is required.';
    if (!formData.email.trim()) nextErrors.email = 'Email is required.';
    if (!formData.subject.trim()) nextErrors.subject = 'Subject is required.';
    if (!formData.message.trim()) nextErrors.message = 'Message is required.';

    setValidationErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      setSubmitError('Please complete all required fields before sending your message.');
      return;
    }

    setSubmitting(true);
    setSubmitError('');
    setSubmitSuccess('');

    try {
      const response = await toast.promise(
        fetch('/api/contact', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: fullName,
            email: formData.email.trim(),
            subject: formData.subject.trim(),
            message: formData.message.trim(),
          }),
        }).then(async (res) => {
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            throw new Error(data.error || 'Failed to send your message');
          }
          return data;
        }),
        {
          loading: 'Sending your message…',
          success: 'Message sent. Our support team will get back to you soon.',
          error: (error) => (error instanceof Error ? error.message : 'Could not send your message'),
        },
      );

      setSubmitSuccess('Message sent successfully. Our support team will get back to you soon.');
      setFormData({
        firstName: '',
        lastName: '',
        email: '',
        subject: 'General Inquiry',
        message: '',
      });
      setValidationErrors({});
    } catch (error: unknown) {
      setSubmitError(error instanceof Error ? error.message : 'Could not send your message');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-20">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-16">
        <div className="space-y-8">
          <div className="space-y-4">
            <h1 className="text-4xl md:text-5xl font-bold font-display">Get in Touch</h1>
            <p className="text-lg md:text-xl text-gray-500">Have questions? We&apos;re here to help you 24/7.</p>
          </div>

          <div className="space-y-6">
            <div className="flex items-start space-x-4">
              <div className="p-3 bg-primary/10 rounded-xl text-primary">
                <Mail size={24} />
              </div>
              <div>
                <p className="font-bold">Email Us</p>
                <a className="text-gray-500 hover:text-primary" href="mailto:support@lofimart.com">support@lofimart.com</a>
                <p className="text-gray-500">sales@lofimart.com</p>
              </div>
            </div>

            <div className="flex items-start space-x-4">
              <div className="p-3 bg-primary/10 rounded-xl text-primary">
                <Phone size={24} />
              </div>
              <div>
                <p className="font-bold">Call Us</p>
                <a className="text-gray-500 hover:text-primary" href="tel:+8801700000000">+880 1700-000000</a>
                <p className="text-gray-500">Mon - Fri, 9am - 6pm</p>
              </div>
            </div>

            <div className="flex items-start space-x-4">
              <div className="p-3 bg-primary/10 rounded-xl text-primary">
                <MapPin size={24} />
              </div>
              <div>
                <p className="font-bold">Our Office</p>
                <p className="text-gray-500">Level 4, BDBL Bhaban</p>
                <p className="text-gray-500">Karwan Bazar, Dhaka 1215</p>
              </div>
            </div>
          </div>

          <div className="p-6 md:p-8 bg-gray-900 text-white rounded-3xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="space-y-1">
              <p className="font-bold text-lg">Need faster help?</p>
              <p className="text-sm text-gray-400">Jump straight into the help center or order tracking.</p>
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() =>
                  navigate(
                    '/help?topic=contact-support',
                  )
                }
                className="bg-white/10 px-4 py-3 rounded-2xl hover:bg-white/20 transition-colors"
              >
                <MessageSquare size={22} />
              </button>
              <button
                type="button"
                onClick={() => navigate('/track')}
                className="bg-primary text-white px-4 py-3 rounded-2xl hover:scale-105 transition-transform"
              >
                Track Order
              </button>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 md:p-10 rounded-3xl border border-black/5 shadow-2xl space-y-8">
          <h2 className="text-2xl font-bold">Send us a Message</h2>
          <form className="space-y-6" onSubmit={handleSubmit}>
            {submitError ? <FormNotice tone="error">{submitError}</FormNotice> : null}
            {submitSuccess ? <FormNotice tone="success">{submitSuccess}</FormNotice> : null}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">First Name</label>
                <input type="text" value={formData.firstName} onChange={(e) => handleChange('firstName', e.target.value)} aria-invalid={Boolean(validationErrors.firstName)} className="w-full bg-bg-light border-none rounded-xl py-3 px-4 focus:ring-2 focus:ring-primary/20" placeholder="John" />
                {validationErrors.firstName ? <p className="text-sm text-red-600">{validationErrors.firstName}</p> : null}
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Last Name</label>
                <input type="text" value={formData.lastName} onChange={(e) => handleChange('lastName', e.target.value)} aria-invalid={Boolean(validationErrors.lastName)} className="w-full bg-bg-light border-none rounded-xl py-3 px-4 focus:ring-2 focus:ring-primary/20" placeholder="Doe" />
                {validationErrors.lastName ? <p className="text-sm text-red-600">{validationErrors.lastName}</p> : null}
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Email Address</label>
              <input type="email" value={formData.email} onChange={(e) => handleChange('email', e.target.value)} aria-invalid={Boolean(validationErrors.email)} className="w-full bg-bg-light border-none rounded-xl py-3 px-4 focus:ring-2 focus:ring-primary/20" placeholder="john@example.com" />
              {validationErrors.email ? <p className="text-sm text-red-600">{validationErrors.email}</p> : null}
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Subject</label>
              <select value={formData.subject} onChange={(e) => handleChange('subject', e.target.value)} aria-invalid={Boolean(validationErrors.subject)} className="w-full bg-bg-light border-none rounded-xl py-3 px-4 focus:ring-2 focus:ring-primary/20">
                <option>General Inquiry</option>
                <option>Order Support</option>
                <option>Seller Partnership</option>
                <option>Technical Issue</option>
              </select>
              {validationErrors.subject ? <p className="text-sm text-red-600">{validationErrors.subject}</p> : null}
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Message</label>
              <textarea rows={5} value={formData.message} onChange={(e) => handleChange('message', e.target.value)} aria-invalid={Boolean(validationErrors.message)} className="w-full bg-bg-light border-none rounded-xl py-3 px-4 focus:ring-2 focus:ring-primary/20" placeholder="How can we help you?" />
              {validationErrors.message ? <p className="text-sm text-red-600">{validationErrors.message}</p> : null}
            </div>
            <button type="submit" disabled={submitting} className="w-full btn-primary py-4 flex items-center justify-center space-x-2 disabled:opacity-60">
              {submitting ? <Loader2 size={20} className="animate-spin" /> : <Send size={20} />}
              <span>{submitting ? 'Sending...' : 'Send Message'}</span>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
