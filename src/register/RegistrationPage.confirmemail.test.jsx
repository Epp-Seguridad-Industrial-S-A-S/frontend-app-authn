import React from 'react';
import { Provider } from 'react-redux';

import { mergeConfig } from '@edx/frontend-platform';
import {
  configure, getLocale, injectIntl, IntlProvider,
} from '@edx/frontend-platform/i18n';
import {
  createEvent, fireEvent, render, screen,
} from '@testing-library/react';
import { BrowserRouter as Router } from 'react-router-dom';
import configureStore from 'redux-mock-store';

import { REGISTER_NEW_USER } from './data/actions';
import RegistrationPage from './RegistrationPage';

// The confirm-email check must not depend on reCAPTCHA; stub the widget as auto-solved.
jest.mock('react-google-recaptcha', () => {
  const ReactModule = jest.requireActual('react');
  return {
    __esModule: true,
    default: ReactModule.forwardRef((props, ref) => {
      ReactModule.useImperativeHandle(ref, () => ({ reset: jest.fn(), execute: jest.fn() }));
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

const fillBaseFields = () => {
  fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'John Doe', name: 'name' } });
  fireEvent.change(screen.getByLabelText('Public username'), { target: { value: 'john_doe', name: 'username' } });
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'john.doe@example.com', name: 'email' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password1', name: 'password' } });
};

describe('RegistrationPage confirm email', () => {
  beforeEach(() => {
    configure({
      loggingService: { logError: jest.fn() },
      config: { ENVIRONMENT: 'production', LANGUAGE_PREFERENCE_COOKIE_NAME: 'yum' },
      messages: { 'es-419': {}, de: {}, 'en-us': {} },
    });
    getLocale.mockImplementation(() => 'en-us');
  });

  afterEach(() => jest.clearAllMocks());

  describe('enabled (EPP_ENABLE_CONFIRM_EMAIL: true)', () => {
    beforeAll(() => {
      mergeConfig({ EPP_ENABLE_CONFIRM_EMAIL: true, RECAPTCHA_PUBLIC_KEY: '', ENABLE_REGISTRATION_RECAPTCHA: false });
    });

    it('renders a second email input', () => {
      renderPage(mockStore(baseState));
      expect(screen.getByLabelText('Confirmar correo electrónico')).toBeTruthy();
    });

    it('blocks paste and drop on the confirm-email input', () => {
      renderPage(mockStore(baseState));
      const confirmInput = screen.getByLabelText('Confirmar correo electrónico');

      const pasteEvent = createEvent.paste(confirmInput, { clipboardData: { getData: () => 'x@y.com' } });
      pasteEvent.preventDefault = jest.fn();
      fireEvent(confirmInput, pasteEvent);
      expect(pasteEvent.preventDefault).toHaveBeenCalled();

      const dropEvent = createEvent.drop(confirmInput);
      dropEvent.preventDefault = jest.fn();
      fireEvent(confirmInput, dropEvent);
      expect(dropEvent.preventDefault).toHaveBeenCalled();
    });

    it('still allows paste on the primary email input', () => {
      renderPage(mockStore(baseState));
      const emailInput = screen.getByLabelText('Email');
      const pasteEvent = createEvent.paste(emailInput, { clipboardData: { getData: () => 'x@y.com' } });
      pasteEvent.preventDefault = jest.fn();
      fireEvent(emailInput, pasteEvent);
      expect(pasteEvent.preventDefault).not.toHaveBeenCalled();
    });

    it('blocks submission and shows an error when the two emails differ', () => {
      const store = mockStore(baseState);
      store.dispatch = jest.fn(store.dispatch);
      renderPage(store);

      fillBaseFields();
      fireEvent.change(screen.getByLabelText('Confirmar correo electrónico'), {
        target: { value: 'john.doe@exampl.com', name: 'confirm_email' },
      });
      fireEvent.click(document.querySelector('button.btn-brand'));

      expect(getRegisterCall(store.dispatch)).toBeUndefined();
      expect(screen.getByText('The email addresses do not match.')).toBeTruthy();
    });

    it('submits when the emails match and never sends confirm_email in the payload', () => {
      const store = mockStore(baseState);
      store.dispatch = jest.fn(store.dispatch);
      renderPage(store);

      fillBaseFields();
      fireEvent.change(screen.getByLabelText('Confirmar correo electrónico'), {
        target: { value: 'john.doe@example.com', name: 'confirm_email' },
      });
      fireEvent.click(document.querySelector('button.btn-brand'));

      const registerCall = getRegisterCall(store.dispatch);
      expect(registerCall).toBeDefined();
      expect(registerCall.payload.registrationInfo).not.toHaveProperty('confirm_email');
    });
  });

  describe('disabled (default)', () => {
    beforeAll(() => {
      mergeConfig({ EPP_ENABLE_CONFIRM_EMAIL: false, RECAPTCHA_PUBLIC_KEY: '', ENABLE_REGISTRATION_RECAPTCHA: false });
    });

    it('does not render a second email input', () => {
      renderPage(mockStore(baseState));
      expect(screen.queryByLabelText('Confirmar correo electrónico')).toBeNull();
    });
  });
});
