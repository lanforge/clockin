import React, { useState } from 'react';
import axios from 'axios';
import { HelpCircle, AlertTriangle, Send, CheckCircle2, ShieldAlert } from 'lucide-react';
import CustomSelect from './CustomSelect';
import CustomCheckbox from './CustomCheckbox';
import CustomDatePicker from './CustomDatePicker';

export function HelpAndReporting() {
  const [formData, setFormData] = useState({
    inquiryType: 'general_help',
    submitterName: '',
    submitterEmail: '',
    subject: '',
    details: '',
    urgency: 'medium',
    incidentDate: '',
    involvedParties: '',
  });
  
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleAnonymousChange = (e) => {
    const checked = e.target.checked;
    setIsAnonymous(checked);
    
    // Automatically switch to anon_report if they check anonymous
    if (checked && formData.inquiryType === 'general_help') {
      setFormData(prev => ({
        ...prev,
        inquiryType: 'anon_report',
        submitterName: '',
        submitterEmail: ''
      }));
    } else if (checked) {
      setFormData(prev => ({
        ...prev,
        submitterName: '',
        submitterEmail: ''
      }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setSubmitStatus(null);
    setErrorMessage('');

    if (!formData.inquiryType || !formData.subject || !formData.details) {
      setSubmitStatus('error');
      setErrorMessage('Please fill out all required fields');
      setIsSubmitting(false);
      return;
    }

    try {
      const payload = { ...formData };
      if (isAnonymous) {
        payload.submitterName = '';
        payload.submitterEmail = '';
      }
      
      const res = await axios.post('/api/help-inquiry', payload);
      if (res.data.success) {
        setSubmitStatus('success');
        setFormData({
          inquiryType: 'general_help',
          submitterName: '',
          submitterEmail: '',
          subject: '',
          details: '',
          urgency: 'medium',
          incidentDate: '',
          involvedParties: '',
        });
        setIsAnonymous(false);
      }
    } catch (err) {
      setSubmitStatus('error');
      setErrorMessage(err.response?.data?.error || 'An error occurred while submitting your request.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-gray-800 rounded-xl shadow-sm border border-gray-700 p-4 sm:p-6">
        {submitStatus === 'success' ? (
          <div className="bg-green-900/30 border border-green-800 rounded-lg p-6 text-center space-y-4">
            <div className="flex justify-center">
              <CheckCircle2 className="text-green-500" size={48} />
            </div>
            <h3 className="text-xl font-bold text-white">Submission Successful</h3>
            <p className="text-gray-300">
              Your inquiry has been submitted and will be reviewed by the appropriate team members.
            </p>
            <button
              onClick={() => setSubmitStatus(null)}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors mt-4 inline-block"
            >
              Submit Another Request
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            {submitStatus === 'error' && (
              <div className="p-4 bg-red-900/30 border border-red-800 rounded-lg text-red-200">
                {errorMessage}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">
                    Request Type *
                  </label>
                <CustomSelect
                  name="inquiryType"
                  value={formData.inquiryType}
                  onChange={handleChange}
                  options={[
                    { value: 'general_help', label: 'General Help / Question' },
                    { value: 'hr_request', label: 'HR Request' },
                    { value: 'anon_report', label: 'Anonymous Report / Grievance' },
                    { value: 'other', label: 'Other' }
                  ]}
                />
                </div>

                <CustomCheckbox
                  id="isAnonymous"
                  checked={isAnonymous}
                  onChange={handleAnonymousChange}
                  label="Submit Anonymously"
                  icon={ShieldAlert}
                />

                {!isAnonymous && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-1">
                        Your Name
                      </label>
                      <input
                        type="text"
                        name="submitterName"
                        value={formData.submitterName}
                        onChange={handleChange}
                        placeholder="Leave blank to use account details"
                        className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-1">
                        Your Email
                      </label>
                      <input
                        type="email"
                        name="submitterEmail"
                        value={formData.submitterEmail}
                        onChange={handleChange}
                        placeholder="Leave blank to use account email"
                        className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  </>
                )}
                
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">
                    Urgency
                  </label>
                  <CustomSelect
                    name="urgency"
                    value={formData.urgency}
                    onChange={handleChange}
                    options={[
                      { value: 'low', label: 'Low - General inquiry' },
                      { value: 'medium', label: 'Medium - Needs attention soon' },
                      { value: 'high', label: 'High - Urgent / Time sensitive' }
                    ]}
                  />
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">
                    Subject *
                  </label>
                <input
                  type="text"
                  name="subject"
                  value={formData.subject}
                  onChange={handleChange}
                  placeholder="Brief description of your inquiry"
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">
                    Details *
                  </label>
                <textarea
                  name="details"
                  value={formData.details}
                  onChange={handleChange}
                  rows="5"
                  placeholder="Please provide as much detail as possible..."
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-indigo-500 resize-none"
                ></textarea>
                </div>
              </div>
            </div>

            {(formData.inquiryType === 'anon_report' || formData.inquiryType === 'hr_request') && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-gray-900/50 p-4 rounded-lg border border-gray-700">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">
                    Incident Date (if applicable)
                  </label>
                  <CustomDatePicker
                    name="incidentDate"
                    value={formData.incidentDate}
                    onChange={handleChange}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">
                    Involved Parties (optional)
                  </label>
                  <input
                    type="text"
                    name="involvedParties"
                    value={formData.involvedParties}
                    onChange={handleChange}
                    placeholder="Names of others involved"
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>
            )}

            <div className="flex justify-end pt-4 border-t border-gray-700">
              <button
                type="submit"
                disabled={isSubmitting}
                className={`flex items-center space-x-2 px-6 py-2.5 rounded-lg font-medium transition-colors ${
                  isSubmitting
                    ? 'bg-indigo-600/50 text-gray-300 cursor-not-allowed'
                    : 'bg-indigo-600 text-white hover:bg-indigo-700'
                }`}
              >
                {isSubmitting ? (
                  <span>Submitting...</span>
                ) : (
                  <>
                    <Send size={18} />
                    <span>Submit {isAnonymous ? 'Anonymously' : 'Request'}</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
