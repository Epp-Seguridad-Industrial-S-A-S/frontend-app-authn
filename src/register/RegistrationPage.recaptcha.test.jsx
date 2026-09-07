import React from 'react';
import { Provider } from 'react-redux';

import { mergeConfig } from '@edx/frontend-platform';
import {
  configure, getLocale, injectIntl, IntlProvider,
} from '@edx/frontend-platform/i18n';
import { fireEvent, render, screen } from '@testing-library/react';
import { BrowserRouter as Router } from 'react-router-dom';
import configureStore from 'redux-mock-store';

import { REGISTER_NEW_USER } from './data/actions';
import RegistrationPage from './RegistrationPage';

// Stub the widget: a button that resolves the challenge, plus an imperative reset() spy.
const mockRecaptchaReset = jest.fn();
jest.mock('react-google-recaptcha', () => {
  const ReactModule = jest.requireActual('react');
  return {
    __esModule: true,
    default: ReactModule.forwardRef((props, ref) => {
      ReactModule.useImperativeHandle(ref, () => ({ reset: mockRecaptchaReset, execute: jest.fn() }));
      return (
        <button type="button" data-testid="recaptcha-solve" onClick={() => props.onChange('test-token')}>
          solve recaptcha
        </button>
      );
    }),
  };
});

jest.mock('@edx/frontend-platform/analytics', () => ({
  sendPageEvent: jest.fn(),
  sendTrackEvent: jest.fn(),
}));
jest.mock('@edx/frontend-platform/i18n', () => ({
  ...jest.requireActual('@edx/frontend-platform/i18n'),
  getLocale: jest.fn(),
}));

const IntlRegistrationPage = injectIntl(RegistrationPage);
const mockStore = configureStore();

const registrationFormData = {
  configurableFormFields: { marketingEmailsOptIn: true },
  formFields: {
    name: '', email: '', username: '', password: '',
  },
  emailSuggestion: { suggestion: '', type: '' },
  errors: {
    name: '', email: '', username: '', password: '',
  },
};

const baseState = {
  register: {
    registrationResult: { success: false, redirectUrl: '' },
    registrationError: {},
    registrationFormData,
    usernameSuggestions: [],
  },
  commonComponents: {
    thirdPartyAuthApiStatus: null,
    thirdPartyAuthContext: {
      currentProvider: null, finishAuthUrl: null, providers: [], pipelineUserDetails: null, countryCode: null,
    },
    fieldDescriptions: {},
    optionalFields: { fields: {}, extended_profile: [] },
  },
};

const renderPage = (store) => render(
  <IntlProvider locale="en">
    <Provider store={store}>
      <Router><IntlRegistrationPage /></Router>
    </Provider>
  </IntlProvider>,
);

const getRegisterCall = (dispatch) => dispatch.mock.calls
  .map(([action]) => action)
  .find((action) => action && action.type === REGISTER_NEW_USER.BASE);

describe('RegistrationPage reCAPTCHA', () => {
  beforeAll(() => {
    mergeConfig({
      RECAPTCHA_PUBLIC_KEY: 'test-site-key',
      ENABLE_REGISTRATION_RECAPTCHA: true,
      EPP_ENABLE_CONFIRM_EMAIL: false, // isolate reCAPTCHA behaviour from the confirm-email gate
    });
  });

  beforeEach(() => {
    configure({
      loggingService: { logError: jest.fn() },
      config: { ENVIRONMENT: 'production', LANGUAGE_PREFERENCE_COOKIE_NAME: 'yum' },
      messages: { 'es-419': {}, de: {}, 'en-us': {} },
    });
    getLocale.mockImplementation(() => 'en-us');
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const fillRequiredFields = () => {
    fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'John Doe', name: 'name' } });
    fireEvent.change(screen.getByLabelText('Public username'), { target: { value: 'john_doe', name: 'username' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'john.doe@example.com', name: 'email' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password1', name: 'password' } });
  };

  it('renders the widget when a site key is configured', () => {
    renderPage(mockStore(baseState));
    expect(screen.getByTestId('register-recaptcha')).toBeTruthy();
  });

  it('blocks submission and shows an error until the challenge is solved', () => {
    const store = mockStore(baseState);
    store.dispatch = jest.fn(store.dispatch);
    renderPage(store);

    fillRequiredFields();
    fireEvent.click(document.querySelector('button.btn-brand'));

    expect(getRegisterCall(store.dispatch)).toBeUndefined();
    expect(screen.getByText('Por favor completa el CAPTCHA para crear tu cuenta.')).toBeTruthy();
  });

  it('sends recaptcha_token in the payload once solved', () => {
    const store = mockStore(baseState);
    store.dispatch = jest.fn(store.dispatch);
    renderPage(store);

    fillRequiredFields();
    fireEvent.click(screen.getByTestId('recaptcha-solve'));
    fireEvent.click(document.querySelector('button.btn-brand'));

    const registerCall = getRegisterCall(store.dispatch);
    expect(registerCall).toBeDefined();
    expect(registerCall.payload.registrationInfo.recaptcha_token).toEqual('test-token');
  });

  it('surfaces a server-side rejection and resets the widget', () => {
    const store = mockStore({
      ...baseState,
      register: {
        ...baseState.register,
        registrationError: { recaptchaToken: [{ userMessage: 'CAPTCHA verification failed. Please try again.' }] },
      },
    });
    renderPage(store);

    expect(screen.getByText('CAPTCHA verification failed. Please try again.')).toBeTruthy();
    expect(mockRecaptchaReset).toHaveBeenCalled();
  });
});
