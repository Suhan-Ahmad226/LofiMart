import React, { useEffect, useMemo, useState } from 'react';
import {
  Bell,
  Camera,
  ChevronDown,
  CreditCard,
  Lock,
  MapPin,
  ShieldCheck,
  Trash2,
  User,
} from 'lucide-react';
import { useUser } from '../../../features/shared/state/UserContext';
import { buildBangladeshAddressLine, getDistrictOptions, getDivisionOptions, getUpazilaOptions } from '../../../lib/bangladesh-address';
import { useNavigate, useSearchParams } from '../../../lib/navigation';
import { CenteredLoader, FormNotice } from '@/features/shared/ui/FeedbackState';

type ProfileManagerProps = {
  role: 'customer' | 'seller' | 'reseller';
  title: string;
  description: string;
  enabledSections?: SectionId[];
  showPageHeader?: boolean;
};

type SectionId = 'profile' | 'addresses' | 'verification' | 'notifications' | 'payout' | 'security';

type SectionShellProps = {
  id: SectionId;
  title: string;
  description: string;
  icon: React.ReactNode;
  focused: boolean;
  open: boolean;
  itemCount?: string;
  onToggle: (id: SectionId) => void;
  children: React.ReactNode;
};

async function fileToUploadPayload(file: File, maxBytes = 3 * 1024 * 1024) {
  if (file.size > maxBytes && file.type.startsWith('image/')) {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error('Failed to read image'));
      reader.readAsDataURL(file);
    });

    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error('Failed to decode image'));
      element.src = dataUrl;
    });

    const maxDimension = 2200;
    const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Image processing is not supported by this browser');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    let quality = 0.82;
    let output = canvas.toDataURL('image/jpeg', quality);
    while (output.length * 0.75 > maxBytes && quality > 0.5) {
      quality -= 0.08;
      output = canvas.toDataURL('image/jpeg', quality);
    }

    const estimatedBytes = Math.floor(output.length * 0.75);
    if (estimatedBytes > maxBytes) {
      throw new Error('Image is too large. Please choose a smaller image.');
    }

    return { data_url: output, mime_type: 'image/jpeg', size_bytes: estimatedBytes };
  }

  if (file.size > maxBytes) {
    throw new Error(`${file.name} is too large. Please keep each document under 3 MB.`);
  }

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });

  return {
    data_url: dataUrl,
    mime_type: file.type,
    size_bytes: file.size,
  };
}

async function parseApiResponse(response: Response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(
      response.status === 413
        ? 'Upload is too large. Please choose smaller documents (maximum 3 MB each).'
        : `Request failed (${response.status}). Please try again.`,
    );
  }
}

const emptyAddress = {
  label: '',
  type: 'shipping',
  name: '',
  phone: '',
  alternate_phone: '',
  division: 'Dhaka',
  district: '',
  upazila: '',
  house: '',
  road: '',
  village: '',
  address: '',
  line2: '',
  city: '',
  state: '',
  postal_code: '',
  country: 'Bangladesh',
  is_default: false,
};

const emptyPayoutMethod = {
  type: 'bank_account',
  provider: 'Bank account',
  account_name: '',
  account_number: '',
  routing_number: '',
  mobile_number: '',
  is_default: true,
};

function SectionShell({ id, title, description, icon, focused, open, itemCount, onToggle, children }: SectionShellProps) {
  return (
    <section
      id={`profile-section-${id}`}
      className={`overflow-hidden rounded-[2rem] border bg-white shadow-sm transition-all ${
        focused ? 'border-primary/30 ring-2 ring-primary/10 bg-primary/[0.02]' : 'border-black/5 hover:border-black/10'
      }`}
    >
      <button
        type="button"
        onClick={() => onToggle(id)}
        className="flex w-full items-start justify-between gap-4 px-6 py-5 text-left md:px-7"
        aria-expanded={open}
        aria-controls={`profile-section-panel-${id}`}
      >
        <div className="flex min-w-0 items-start gap-4">
          <div className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-sm">
            {icon}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-lg font-bold text-gray-950">{title}</h2>
              {itemCount ? (
                <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold text-secondary-foreground">
                  {itemCount}
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-sm text-gray-500">{description}</p>
          </div>
        </div>
        <span
          className={`mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-bg-light text-gray-500 transition-transform ${
            open ? 'rotate-180' : ''
          }`}
        >
          <ChevronDown size={18} />
        </span>
      </button>
      {open ? (
        <div id={`profile-section-panel-${id}`} className="border-t border-black/5 px-6 pb-6 pt-4 md:px-7">
          {children}
        </div>
      ) : null}
    </section>
  );
}

function buildAddressSummary(address: {
  upazila?: string | null;
  district?: string | null;
  division?: string | null;
  address?: string | null;
}) {
  return buildBangladeshAddressLine(address);
}

export function ProfileManager({ role, title, description, enabledSections, showPageHeader = true }: ProfileManagerProps) {
  const { token, user, setUser, logout } = useUser();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const urlSection = (searchParams.get('section') as SectionId | null) || '';
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [profile, setProfile] = useState<any>(null);
  const [profileForm, setProfileForm] = useState({
    name: '',
    phone: '',
    alternate_phone: '',
    bio: '',
    store_name: '',
    profile_visibility: role === 'customer' ? 'private' : 'public',
    response_time_hours: 24,
  });
  const [addressForm, setAddressForm] = useState(emptyAddress);
  const [payoutForm, setPayoutForm] = useState(emptyPayoutMethod);
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '' });
  const [setPasswordState, setSetPasswordState] = useState<'idle' | 'otp' | 'done'>('idle');
  const [setPasswordPin, setSetPasswordPin] = useState('');
  const [setPasswordNew, setSetPasswordNew] = useState('');
  const [phoneVerificationCode, setPhoneVerificationCode] = useState('');
  const [verificationFiles, setVerificationFiles] = useState<Record<string, File | null>>({
    front: null,
    back: null,
    selfie: null,
    business_license: null,
  });
  const [verificationMeta, setVerificationMeta] = useState({
    document_type: 'nid',
    business_name: '',
    notes: '',
  });
  const [focusedSection, setFocusedSection] = useState<SectionId | ''>('');
  const [openSections, setOpenSections] = useState<SectionId[]>(() =>
    enabledSections
      ? enabledSections
      : role === 'customer'
        ? ['profile', 'addresses', 'security']
        : ['profile', 'addresses', 'payout'],
  );

  const showVerification = role === 'seller' || role === 'reseller';
  const showPayouts = role === 'seller' || role === 'reseller';

  const fetchProfile = async () => {
    if (!token) return;
    setLoading(true);
    setError('');

    try {
      const profileRes = await fetch('/api/users/profile', { headers: { Authorization: `Bearer ${token}` } });
      const profileData = await profileRes.json();

      if (!profileRes.ok) {
        throw new Error(profileData.error || 'Failed to load profile');
      }

      setProfile(profileData);
      setProfileForm({
        name: profileData.user?.name || '',
        phone: profileData.user?.phone || '',
        alternate_phone: profileData.user?.alternate_phone || '',
        bio: profileData.user?.bio || '',
        store_name: profileData.user?.store_name || '',
        profile_visibility: profileData.user?.profile_visibility || (role === 'customer' ? 'private' : 'public'),
        response_time_hours: profileData.user?.response_time_hours || 24,
      });
    } catch (err: any) {
      setError(err.message || 'Failed to load profile');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchProfile();
  }, [token]);

  useEffect(() => {
    if (urlSection) {
      setFocusedSection(urlSection);
    }
  }, [urlSection]);

  const payoutMethods = profile?.payout_methods || [];
  const addresses = profile?.addresses || [];
  const transactions = profile?.transaction_history || [];
  const verification = profile?.verification;
  const divisionOptions = useMemo(() => getDivisionOptions(), []);
  const districtOptions = useMemo(() => getDistrictOptions(addressForm.division), [addressForm.division]);
  const upazilaOptions = useMemo(
    () => getUpazilaOptions(addressForm.division, addressForm.district || addressForm.city),
    [addressForm.city, addressForm.district, addressForm.division],
  );

  useEffect(() => {
    if (enabledSections || !focusedSection || typeof window === 'undefined') return;
    setOpenSections((current) => (current.includes(focusedSection) ? current : [...current, focusedSection]));
    window.requestAnimationFrame(() => {
      document.getElementById(`profile-section-${focusedSection}`)?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    });
  }, [enabledSections, focusedSection, profile]);

  const toggleSection = (sectionId: SectionId) => {
    setOpenSections((current) =>
      current.includes(sectionId) ? current.filter((entry) => entry !== sectionId) : [...current, sectionId],
    );
  };

  const runAction = async (action: () => Promise<void>) => {
    setSubmitting(true);
    setMessage('');
    setError('');
    try {
      await action();
    } catch (err: any) {
      setError(err.message || 'Request failed');
    } finally {
      setSubmitting(false);
    }
  };

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    await runAction(async () => {
      const response = await fetch('/api/users/profile', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(profileForm),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to update profile');
      setMessage('Profile updated successfully.');
      setProfile((current: any) => ({ ...current, user: data.user }));
      if (user) {
        setUser({
          ...user,
          name: data.user.name,
          phone: data.user.phone,
          alternate_phone: data.user.alternate_phone,
          avatar_url: data.user.avatar_url,
        });
      }
    });
  };

  const uploadAvatar = async (file: File) => {
    await runAction(async () => {
      const payload = await fileToUploadPayload(file);
      const response = await fetch('/api/users/profile/avatar', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to upload avatar');
      setMessage('Profile image updated.');
      setProfile((current: any) => ({ ...current, user: data.user }));
      if (user) {
        setUser({
          ...user,
          name: data.user.name,
          phone: data.user.phone,
          alternate_phone: data.user.alternate_phone,
          avatar_url: data.user.avatar_url,
        });
      }
    });
  };

  const saveAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    await runAction(async () => {
      const addressSummary =
        addressForm.address.trim() ||
        buildAddressSummary({
          upazila: addressForm.upazila,
          district: addressForm.district || addressForm.city,
          division: addressForm.division || addressForm.state,
          address: addressForm.address,
        });

      const response = await fetch('/api/addresses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          ...addressForm,
          address: addressSummary,
          line2: addressForm.upazila || addressForm.line2,
          city: addressForm.district || addressForm.city,
          state: addressForm.division || addressForm.state,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to save address');
      setMessage('Address saved successfully.');
      setAddressForm(emptyAddress);
      await fetchProfile();
    });
  };

  const removeAddress = async (id: string) => {
    await runAction(async () => {
      const response = await fetch(`/api/addresses/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to delete address');
      setMessage('Address deleted.');
      await fetchProfile();
    });
  };

  const savePayoutMethod = async (e: React.FormEvent) => {
    e.preventDefault();
    await runAction(async () => {
      const response = await fetch('/api/users/payout-methods', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payoutForm),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to save payout method');
      setMessage('Payout method added.');
      setPayoutForm(emptyPayoutMethod);
      await fetchProfile();
    });
  };

  const setDefaultPayoutMethod = async (id: string) => {
    await runAction(async () => {
      const response = await fetch(`/api/users/payout-methods/${id}/default`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to update default payout method');
      setMessage('Default payout method updated.');
      await fetchProfile();
    });
  };

  const deletePayoutMethod = async (id: string) => {
    await runAction(async () => {
      const response = await fetch(`/api/users/payout-methods/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to delete payout method');
      setMessage('Payout method removed.');
      await fetchProfile();
    });
  };

  const submitVerification = async (e: React.FormEvent) => {
    e.preventDefault();
    await runAction(async () => {
      const requiredFiles = {
        front: verificationFiles.front,
        back: verificationFiles.back,
        selfie: verificationFiles.selfie,
      };

      if (!requiredFiles.front || !requiredFiles.back || !requiredFiles.selfie) {
        throw new Error('Front, back, and selfie files are required for verification.');
      }

      const uploadVerificationFile = async (file: File, fieldName: string) => {
        const payload = await fileToUploadPayload(file);
        const response = await fetch('/api/media/upload', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            dataUrl: payload.data_url,
            mimeType: payload.mime_type,
            sizeBytes: payload.size_bytes,
            entityType: 'VerificationSubmission',
            entityId: String(user?.id || ''),
            fieldName,
          }),
        });
        const data = await parseApiResponse(response);
        if (!response.ok || !data.url) {
          throw new Error(data.error?.message || data.error || `Failed to upload ${fieldName.replace(/_/g, ' ')}`);
        }
        return {
          url: String(data.url),
          public_id: data.publicId ? String(data.publicId) : undefined,
          mime_type: payload.mime_type,
          size_bytes: payload.size_bytes,
        };
      };

      const uploadedDocuments: Record<string, any> = {};
      for (const [fieldName, file] of Object.entries(verificationFiles)) {
        if (!file) continue;
        uploadedDocuments[fieldName] = await uploadVerificationFile(file, fieldName);
      }

      const response = await fetch('/api/users/verification', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          document_type: verificationMeta.document_type,
          business_name: verificationMeta.business_name,
          notes: verificationMeta.notes,
          documents: uploadedDocuments,
        }),
      });
      const data = await parseApiResponse(response);
      if (!response.ok) throw new Error(data.error?.message || data.error || 'Failed to submit KYC verification');
      setMessage('Verification submitted successfully.');
      setVerificationFiles({ front: null, back: null, selfie: null, business_license: null });
      await fetchProfile();
    });
  };

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    await runAction(async () => {
      const response = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(passwordForm),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to update password');
      setPasswordForm({ currentPassword: '', newPassword: '' });
      // The server revokes every session (including the one this request used)
      // the moment the password changes. Clear client auth state and send the
      // user to the login page instead of fetching the profile with a now-revoked
      // session (that would surface a confusing 401 in the UI).
      logout();
      navigate('/login?notice=password_changed', { replace: true });
    });
  };

  const passwordIdentifier = profile?.user?.email || user?.email;

  const requestSetPassword = async () => {
    if (!passwordIdentifier) {
      setError('Email address is missing from the profile.');
      return;
    }
    await runAction(async () => {
      const response = await fetch('/api/auth/request-set-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ identifier: passwordIdentifier }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to send verification code');
      setSetPasswordState('otp');
      setMessage('A verification code was sent. Enter it below to set your password.');
    });
  };

  const submitSetPassword = async () => {
    if (!passwordIdentifier) {
      setError('Email address is missing from the profile.');
      return;
    }
    if (setPasswordNew.length < 8) {
      setError('Use at least 8 characters for your password.');
      return;
    }
    await runAction(async () => {
      const response = await fetch('/api/auth/set-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          identifier: passwordIdentifier,
          pin: setPasswordPin,
          password: setPasswordNew,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to set password');
      setSetPasswordState('done');
      setSetPasswordPin('');
      setSetPasswordNew('');
      // The server revokes every session (including the one this request used)
      // the moment the password is set. Clear client auth state and send the user
      // to the login page instead of fetching the profile with a now-revoked
      // session (that would surface a confusing 401 in the UI).
      logout();
      navigate('/login?notice=password_set', { replace: true });
    });
  };

  const sendPhoneVerification = async () => {
    await runAction(async () => {
      const response = await fetch('/api/auth/send-phone-verification', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to send verification code');
      setMessage('Phone verification code sent.');
    });
  };

  const verifyPhone = async () => {
    await runAction(async () => {
      const response = await fetch('/api/auth/verify-phone', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ code: phoneVerificationCode }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to verify phone');
      setPhoneVerificationCode('');
      setMessage('Phone number verified successfully.');
      await fetchProfile();
    });
  };

  const requestPrivacyAction = async (type: 'deactivate' | 'delete_request') => {
    await runAction(async () => {
      const response = await fetch('/api/users/privacy/request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ type }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to submit privacy request');
      setMessage(type === 'deactivate' ? 'Account deactivation request processed.' : 'Account deletion request submitted.');
      await fetchProfile();
    });
  };

  if (loading) {
    return <CenteredLoader label="Loading your profile workspace..." className="min-h-[320px]" />;
  }

  const visibleSection = (id: SectionId) => !enabledSections || enabledSections.includes(id);

  return (
    <div className="space-y-8">
      {showPageHeader ? (
        <div className="surface-card p-8">
          <div>
            <div>
              <h1 className="text-3xl font-bold">{title}</h1>
              <p className="mt-2 max-w-3xl text-sm text-gray-500">{description}</p>
            </div>
          </div>
        </div>
      ) : null}

      {message ? <FormNotice tone="success">{message}</FormNotice> : null}
      {error ? <FormNotice tone="error">{error}</FormNotice> : null}

      <div className="space-y-6">
        {visibleSection('profile') ? (
        <SectionShell
          id="profile"
          title={role === 'customer' ? 'Personal details' : 'Profile and business basics'}
          description={
            role === 'customer'
              ? 'Keep your contact and delivery identity ready so checkout can auto-fill them every time.'
              : 'Manage your profile, store basics, response time, and how your identity appears publicly.'
          }
          icon={<User size={20} />}
          focused={focusedSection === 'profile'}
          open={openSections.includes('profile')}
          onToggle={toggleSection}
        >
          <form onSubmit={saveProfile}>
            <div className="grid gap-5 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-medium">Profile image</label>
                <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-black/5 bg-bg-light/60 p-4">
                  <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl bg-primary/10 text-primary shadow-sm">
                    {profile?.user?.avatar_url ? (
                      <img
                        src={profile.user.avatar_url}
                        alt={profile.user.name}
                        className="h-full w-full object-cover"
                        loading="eager"
                        decoding="async"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <span className="text-xl font-bold">{profile?.user?.name?.[0] || 'U'}</span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-gray-950">{profileForm.name || profile?.user?.name || 'Customer profile'}</p>
                    <p className="mt-1 text-xs text-gray-500">
                      {profile?.user?.email || user?.email || 'Add your contact details for faster checkout'}
                    </p>
                  </div>
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-bg-light px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-secondary">
                    <Camera size={16} />
                    Upload avatar
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="hidden"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) void uploadAvatar(file);
                      }}
                    />
                  </label>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Full name</label>
                <input
                  value={profileForm.name}
                  onChange={(e) => setProfileForm((current) => ({ ...current, name: e.target.value }))}
                  className="w-full rounded-xl bg-bg-light px-4 py-3 outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Phone number</label>
                <input
                  value={profileForm.phone}
                  onChange={(e) => setProfileForm((current) => ({ ...current, phone: e.target.value }))}
                  className="w-full rounded-xl bg-bg-light px-4 py-3 outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>

              {role === 'customer' ? (
                <>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Alternative mobile number</label>
                    <input
                      value={profileForm.alternate_phone}
                      onChange={(e) => setProfileForm((current) => ({ ...current, alternate_phone: e.target.value }))}
                      placeholder="01XXXXXXXXX"
                      className="w-full rounded-xl bg-bg-light px-4 py-3 outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Email address</label>
                    <input
                      value={profile?.user?.email || user?.email || ''}
                      disabled
                      className="w-full rounded-xl bg-bg-light px-4 py-3 text-gray-500 outline-none"
                    />
                    <p className="text-xs text-gray-500">Your order updates and account notices will use this email.</p>
                  </div>
                </>
              ) : null}

              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-medium">Bio</label>
                <textarea
                  rows={3}
                  value={profileForm.bio}
                  onChange={(e) => setProfileForm((current) => ({ ...current, bio: e.target.value }))}
                  placeholder={role === 'customer' ? 'Optional short note about delivery or identity' : undefined}
                  className="w-full rounded-xl bg-bg-light px-4 py-3 outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>

              {showPayouts ? (
                <>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Store name</label>
                    <input
                      value={profileForm.store_name}
                      onChange={(e) => setProfileForm((current) => ({ ...current, store_name: e.target.value }))}
                      className="w-full rounded-xl bg-bg-light px-4 py-3 outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Response time (hours)</label>
                    <input
                      type="number"
                      min={1}
                      max={168}
                      value={profileForm.response_time_hours}
                      onChange={(e) =>
                        setProfileForm((current) => ({ ...current, response_time_hours: Number(e.target.value) }))
                      }
                      className="w-full rounded-xl bg-bg-light px-4 py-3 outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Profile visibility</label>
                    <select
                      value={profileForm.profile_visibility}
                      onChange={(e) => setProfileForm((current) => ({ ...current, profile_visibility: e.target.value }))}
                      className="w-full rounded-xl bg-bg-light px-4 py-3 outline-none focus:ring-2 focus:ring-primary/20"
                    >
                      <option value="public">Public</option>
                      <option value="followers_only">Followers only</option>
                      <option value="private">Private</option>
                    </select>
                  </div>
                </>
              ) : null}
            </div>

            <button type="submit" disabled={submitting} className="mt-6 btn-primary px-6 py-3">
              Save profile
            </button>
          </form>
        </SectionShell>
        ) : null}

        {visibleSection('addresses') ? (
        <SectionShell
          id="addresses"
          title="Delivery profile and addresses"
          description="Save your full delivery details once so checkout can auto-fill them and still stay editable."
          icon={<MapPin size={20} />}
          focused={focusedSection === 'addresses'}
          open={openSections.includes('addresses')}
          itemCount={`${addresses.length} saved`}
          onToggle={toggleSection}
        >
          <form onSubmit={saveAddress}>
            <div className="grid gap-4 rounded-[1.75rem] border border-black/5 bg-bg-light/40 p-4 md:grid-cols-2 md:p-5">
              <input
                value={addressForm.label}
                onChange={(e) => setAddressForm((current) => ({ ...current, label: e.target.value }))}
                placeholder="Address label, e.g. Home"
                className="rounded-xl bg-bg-light px-4 py-3 outline-none focus:ring-2 focus:ring-primary/20"
              />
              <select
                value={addressForm.type}
                onChange={(e) => setAddressForm((current) => ({ ...current, type: e.target.value }))}
                className="rounded-xl bg-bg-light px-4 py-3 outline-none focus:ring-2 focus:ring-primary/20"
              >
                <option value="shipping">Shipping</option>
                <option value="billing">Billing</option>
              </select>
              <input
                value={addressForm.name}
                onChange={(e) => setAddressForm((current) => ({ ...current, name: e.target.value }))}
                placeholder="Recipient name"
                className="rounded-xl bg-bg-light px-4 py-3 outline-none focus:ring-2 focus:ring-primary/20"
              />
              <input
                value={addressForm.phone}
                onChange={(e) => setAddressForm((current) => ({ ...current, phone: e.target.value }))}
                placeholder="Phone number"
                className="rounded-xl bg-bg-light px-4 py-3 outline-none focus:ring-2 focus:ring-primary/20"
              />
              <input
                value={addressForm.alternate_phone}
                onChange={(e) => setAddressForm((current) => ({ ...current, alternate_phone: e.target.value }))}
                placeholder="Alternative mobile number"
                className="rounded-xl bg-bg-light px-4 py-3 outline-none focus:ring-2 focus:ring-primary/20"
              />
              <select
                value={addressForm.division}
                onChange={(e) =>
                  setAddressForm((current) => ({
                    ...current,
                    division: e.target.value,
                    state: e.target.value,
                    district: '',
                    city: '',
                    upazila: '',
                    line2: '',
                  }))
                }
                className="rounded-xl bg-bg-light px-4 py-3 outline-none focus:ring-2 focus:ring-primary/20"
              >
                {divisionOptions.map((division) => (
                  <option key={division} value={division}>
                    {division}
                  </option>
                ))}
              </select>
              <select
                value={addressForm.district}
                onChange={(e) =>
                  setAddressForm((current) => ({
                    ...current,
                    district: e.target.value,
                    city: e.target.value,
                    upazila: '',
                    line2: '',
                  }))
                }
                className="rounded-xl bg-bg-light px-4 py-3 outline-none focus:ring-2 focus:ring-primary/20"
              >
                <option value="">Select district</option>
                {districtOptions.map((district) => (
                  <option key={district} value={district}>
                    {district}
                  </option>
                ))}
              </select>
              <select
                value={addressForm.upazila}
                onChange={(e) => setAddressForm((current) => ({ ...current, upazila: e.target.value, line2: e.target.value }))}
                className="rounded-xl bg-bg-light px-4 py-3 outline-none focus:ring-2 focus:ring-primary/20"
              >
                <option value="">Select upazila / thana</option>
                {upazilaOptions.map((upazila) => (
                  <option key={upazila} value={upazila}>
                    {upazila}
                  </option>
                ))}
              </select>
              <textarea
                value={addressForm.address}
                onChange={(e) => setAddressForm((current) => ({ ...current, address: e.target.value }))}
                rows={3}
                placeholder="House / holding / road / village / landmark"
                className="rounded-xl bg-bg-light px-4 py-3 outline-none focus:ring-2 focus:ring-primary/20 md:col-span-2"
              />
              <label className="flex items-center gap-2 rounded-xl bg-bg-light px-4 py-3 text-sm">
                <input
                  type="checkbox"
                  checked={addressForm.is_default}
                  onChange={(e) => setAddressForm((current) => ({ ...current, is_default: e.target.checked }))}
                />
                Set as default
              </label>
            </div>

            <button type="submit" disabled={submitting} className="mt-6 btn-primary px-6 py-3">
              Save address
            </button>

            <div className="mt-6 space-y-3">
              {addresses.map((address: any) => (
                <div key={address.id} className="flex items-start justify-between gap-4 rounded-[1.75rem] border border-black/5 bg-white p-4 shadow-sm">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-gray-900">{address.name}</p>
                      {address.is_default ? (
                        <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary">Default</span>
                      ) : null}
                      {address.label ? (
                        <span className="rounded-full bg-secondary px-2.5 py-1 text-[11px] font-semibold text-secondary-foreground">
                          {address.label}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-2 text-sm text-gray-600">{address.phone}</p>
                    {address.alternate_phone ? <p className="text-sm text-gray-500">Alternative: {address.alternate_phone}</p> : null}
                    <p className="mt-2 text-sm leading-6 text-gray-600">{buildAddressSummary(address)}</p>
                    {address.postal_code ? <p className="text-sm text-gray-500">Postal code: {address.postal_code}</p> : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => void removeAddress(address.id)}
                    className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary text-gray-500 hover:text-accent"
                    aria-label="Remove address"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              ))}
            </div>
          </form>
        </SectionShell>
        ) : null}

        {showVerification && visibleSection('verification') ? (
          <SectionShell
            id="verification"
            title="Verification"
            description="Submit KYC details and business documents so payouts, store trust, and courier operations stay compliant."
            icon={<ShieldCheck size={20} />}
            focused={focusedSection === 'verification'}
            open={openSections.includes('verification')}
            itemCount={verification?.status ? String(verification.status) : 'Not submitted'}
            onToggle={toggleSection}
          >
            <form onSubmit={submitVerification}>
              <div className="mb-4 rounded-2xl bg-bg-light px-4 py-3 text-sm text-gray-600">
                Current status:{' '}
                <span className="font-bold capitalize text-primary">{verification?.status || 'not submitted'}</span>
                {verification?.rejection_reason ? (
                  <span className="mt-1 block text-accent">Reason: {verification.rejection_reason}</span>
                ) : null}
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <select
                  value={verificationMeta.document_type}
                  onChange={(e) => setVerificationMeta((current) => ({ ...current, document_type: e.target.value }))}
                  className="rounded-xl bg-bg-light px-4 py-3 outline-none focus:ring-2 focus:ring-primary/20"
                >
                  <option value="nid">NID card</option>
                  <option value="birth_certificate">Birth certificate</option>
                  <option value="passport">Passport</option>
                </select>
                <input
                  value={verificationMeta.business_name}
                  onChange={(e) => setVerificationMeta((current) => ({ ...current, business_name: e.target.value }))}
                  placeholder="Business name (optional)"
                  className="rounded-xl bg-bg-light px-4 py-3 outline-none focus:ring-2 focus:ring-primary/20"
                />
                <textarea
                  value={verificationMeta.notes}
                  onChange={(e) => setVerificationMeta((current) => ({ ...current, notes: e.target.value }))}
                  rows={3}
                  placeholder="Additional verification notes"
                  className="rounded-xl bg-bg-light px-4 py-3 outline-none focus:ring-2 focus:ring-primary/20 md:col-span-2"
                />
                {[
                  ['front', 'Document front'],
                  ['back', 'Document back'],
                  ['selfie', 'Selfie with document'],
                  ['business_license', 'Business license (optional)'],
                ].map(([key, label]) => (
                  <label key={key} className="rounded-2xl border border-dashed border-gray-300 p-4 text-sm text-gray-600">
                    <span className="mb-2 block font-medium text-gray-900">{label}</span>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,application/pdf"
                      onChange={(event) => {
                        const file = event.target.files?.[0] || null;
                        setVerificationFiles((current) => ({ ...current, [key]: file }));
                      }}
                    />
                    {verificationFiles[key] ? (
                      <span className="mt-2 block text-xs text-primary">{verificationFiles[key]?.name}</span>
                    ) : null}
                  </label>
                ))}
              </div>
              <button type="submit" disabled={submitting} className="mt-6 btn-primary px-6 py-3">
                Submit verification
              </button>
            </form>
          </SectionShell>
        ) : null}

        {showPayouts && visibleSection('payout') ? (
          <SectionShell
            id="payout"
            title="Payments and payouts"
            description="Keep your payout methods and recent settlement activity together in one clear workspace."
            icon={<CreditCard size={20} />}
            focused={focusedSection === 'payout'}
            open={openSections.includes('payout')}
            itemCount={`${payoutMethods.length} methods`}
            onToggle={toggleSection}
          >
            <form onSubmit={savePayoutMethod}>
              <div className="grid gap-4">
                <select
                  value={payoutForm.type}
                  onChange={(e) => setPayoutForm((current) => ({ ...current, type: e.target.value }))}
                  className="rounded-xl bg-bg-light px-4 py-3 outline-none focus:ring-2 focus:ring-primary/20"
                >
                  <option value="bank_account">Bank account</option>
                  <option value="mobile_banking">Mobile banking</option>
                  <option value="paypal">PayPal</option>
                </select>
                <input
                  value={payoutForm.provider}
                  onChange={(e) => setPayoutForm((current) => ({ ...current, provider: e.target.value }))}
                  placeholder="Provider name"
                  className="rounded-xl bg-bg-light px-4 py-3 outline-none focus:ring-2 focus:ring-primary/20"
                />
                <input
                  value={payoutForm.account_name}
                  onChange={(e) => setPayoutForm((current) => ({ ...current, account_name: e.target.value }))}
                  placeholder="Account name"
                  className="rounded-xl bg-bg-light px-4 py-3 outline-none focus:ring-2 focus:ring-primary/20"
                />
                <input
                  value={payoutForm.account_number}
                  onChange={(e) => setPayoutForm((current) => ({ ...current, account_number: e.target.value }))}
                  placeholder="Account number"
                  className="rounded-xl bg-bg-light px-4 py-3 outline-none focus:ring-2 focus:ring-primary/20"
                />
                <input
                  value={payoutForm.routing_number}
                  onChange={(e) => setPayoutForm((current) => ({ ...current, routing_number: e.target.value }))}
                  placeholder="Routing number"
                  className="rounded-xl bg-bg-light px-4 py-3 outline-none focus:ring-2 focus:ring-primary/20"
                />
                <input
                  value={payoutForm.mobile_number}
                  onChange={(e) => setPayoutForm((current) => ({ ...current, mobile_number: e.target.value }))}
                  placeholder="Mobile banking number"
                  className="rounded-xl bg-bg-light px-4 py-3 outline-none focus:ring-2 focus:ring-primary/20"
                />
                <label className="flex items-center gap-2 rounded-xl bg-bg-light px-4 py-3 text-sm">
                  <input
                    type="checkbox"
                    checked={payoutForm.is_default}
                    onChange={(e) => setPayoutForm((current) => ({ ...current, is_default: e.target.checked }))}
                  />
                  Set as default payout method
                </label>
              </div>

              <button type="submit" disabled={submitting} className="mt-6 btn-primary px-6 py-3">
                Add payout method
              </button>

              <div className="mt-6 space-y-3">
                {payoutMethods.map((method: any) => (
                  <div key={method.id} className="rounded-2xl bg-secondary/60 p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="font-semibold text-gray-900">
                          {method.provider} {method.is_default ? <span className="text-primary">(Default)</span> : null}
                        </p>
                        <p className="text-sm text-gray-500">{method.type}</p>
                        <p className="text-sm text-gray-600">
                          {method.bank_account_masked || method.mobile_number_masked || method.account_last4 || 'Stored securely'}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        {!method.is_default ? (
                          <button type="button" onClick={() => void setDefaultPayoutMethod(method.id)} className="text-sm font-semibold text-primary">
                            Make default
                          </button>
                        ) : null}
                        <button type="button" onClick={() => void deletePayoutMethod(method.id)} className="text-sm font-semibold text-accent">
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-6 space-y-3">
                <h3 className="font-semibold text-gray-900">Recent transaction activity</h3>
                {transactions.slice(0, 5).map((transaction: any) => (
                  <div key={transaction.id} className="rounded-2xl bg-bg-light px-4 py-3 text-sm">
                    <p className="font-medium text-gray-900">{transaction.type}</p>
                    <p className="text-gray-500">
                      {transaction.amount} {transaction.currency} • {transaction.status}
                    </p>
                  </div>
                ))}
              </div>
            </form>
          </SectionShell>
        ) : null}

        {visibleSection('security') ? (
        <SectionShell
          id="security"
          title="Security and privacy"
          description="Set or update your password and control data export or privacy requests."
          icon={<Lock size={20} />}
          focused={focusedSection === 'security'}
          open={openSections.includes('security')}
          onToggle={toggleSection}
        >
          {profile?.user?.has_password ? (
            <form onSubmit={changePassword} className="space-y-4">
              <div>
                <label htmlFor="current-password" className="mb-1.5 block text-sm font-semibold text-slate-700">
                  Current password
                </label>
                <input
                  id="current-password"
                  name="currentPassword"
                  value={passwordForm.currentPassword}
                  onChange={(e) => setPasswordForm((current) => ({ ...current, currentPassword: e.target.value }))}
                  placeholder="Enter your current password"
                  type="password"
                  autoComplete="current-password"
                  className="w-full rounded-xl bg-bg-light px-4 py-3 outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <div>
                <label htmlFor="new-password" className="mb-1.5 block text-sm font-semibold text-slate-700">
                  New password
                </label>
                <input
                  id="new-password"
                  name="newPassword"
                  value={passwordForm.newPassword}
                  onChange={(e) => setPasswordForm((current) => ({ ...current, newPassword: e.target.value }))}
                  placeholder="At least 8 characters"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  className="w-full rounded-xl bg-bg-light px-4 py-3 outline-none focus:ring-2 focus:ring-primary/20"
                />
                <p className="mt-1.5 text-xs text-slate-400">Use at least 8 characters. Mix letters, numbers and symbols for a stronger password.</p>
              </div>
              <button type="submit" disabled={submitting} className="btn-primary px-6 py-3">
                Update password
              </button>
            </form>
          ) : setPasswordState === 'done' ? (
            <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm font-medium text-emerald-700">
              You now have a password. Next time you can sign in with your email and password.
            </div>
          ) : setPasswordState === 'otp' ? (
            <div className="space-y-4">
              <p className="text-sm text-gray-500">
                We sent a verification code to your email. Enter it and choose your new password.
              </p>
              <div>
                <label htmlFor="set-password-pin" className="mb-1.5 block text-sm font-semibold text-slate-700">
                  Verification code
                </label>
                <input
                  id="set-password-pin"
                  name="setPasswordPin"
                  value={setPasswordPin}
                  onChange={(e) => setSetPasswordPin(e.target.value.replace(/\D/g, ''))}
                  placeholder="6-digit code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  className="w-full rounded-xl bg-bg-light px-4 py-3 outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <div>
                <label htmlFor="set-password-new" className="mb-1.5 block text-sm font-semibold text-slate-700">
                  New password
                </label>
                <input
                  id="set-password-new"
                  name="setPasswordNew"
                  value={setPasswordNew}
                  onChange={(e) => setSetPasswordNew(e.target.value)}
                  placeholder="At least 8 characters"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  className="w-full rounded-xl bg-bg-light px-4 py-3 outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <div className="flex flex-wrap gap-3">
                <button type="button" onClick={() => void submitSetPassword()} disabled={submitting} className="btn-primary px-6 py-3">
                  Set password
                </button>
                <button
                  type="button"
                  onClick={() => void requestSetPassword()}
                  disabled={submitting}
                  className="rounded-xl border border-gray-200 px-4 py-3 text-sm font-semibold text-gray-700"
                >
                  Resend code
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-gray-500">
                This account currently has no password — sign in works through a linked Google or Facebook account.
                Set a password to also sign in with your email.
              </p>
              <button type="button" onClick={() => void requestSetPassword()} disabled={submitting} className="btn-primary px-6 py-3">
                Set a password
              </button>
            </div>
          )}

          <div className="mt-8 space-y-3">
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => void requestPrivacyAction('deactivate')}
                className="rounded-xl border border-amber-300 px-4 py-3 text-sm font-semibold text-amber-700"
              >
                Deactivate account
              </button>
              <button
                type="button"
                onClick={() => void requestPrivacyAction('delete_request')}
                className="rounded-xl border border-red-300 px-4 py-3 text-sm font-semibold text-red-700"
              >
                Request permanent deletion
              </button>
            </div>
          </div>
        </SectionShell>
        ) : null}
      </div>
    </div>
  );
}

export default ProfileManager;
