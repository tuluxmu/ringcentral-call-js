import { EventEmitter } from 'events';
import RingCentralWebPhone from 'ringcentral-web-phone';
import { RingCentralCallControl } from 'ringcentral-call-control';
import { Session, Events as SessionEvents } from './Session';

import { extractHeadersData } from './utils'

export interface MakeCallParams {
  toNumber: string;
  fromNumber?: string;
  deviceId?: string;
  type: 'webphone' | 'callControl';
  homeContryId?: string;
}

export class RingCentralCall extends EventEmitter {
  private _webphone: RingCentralWebPhone;
  private _activeCallControl: RingCentralCallControl;
  private _sessions: Session[];

  constructor({
    webphone,
    activeCallControl,
  }) {
    super();
    //
    this._webphone = webphone;
    this._activeCallControl = activeCallControl;
    this._sessions = [];

    // @ts-ignore
    this._activeCallControl.on('new', this._onNewTelephonySession);
    this._webphone.userAgent.on('invite', this._onWebPhoneSessionRing);
  }

  async makeCall(params : MakeCallParams) {
    if (params.type === 'webphone') {
      const webphoneSession = this._webphone.userAgent.invite(params.toNumber, {
        fromNumber: params.fromNumber,
        homeCountryId: params.homeContryId,
      } as any);
      return this._onNewWebPhoneSession(webphoneSession);
    }
    const callParams : any = {}
    if (params.toNumber.length > 5) {
      callParams.phoneNumber = params.toNumber;
    } else {
      callParams.extensionNumber = params.toNumber;
    }
    const telephonySession = await this._activeCallControl.createCall(params.deviceId, callParams);
    return this._onNewTelephonySession(telephonySession);
  }

  _onNewWebPhoneSession(webphoneSession) {
    const newSession = new Session({
      webphoneSession,
      webphone: this.webphone,
      activeCallControl: this.activeCallControl,
    });
    // @ts-ignore
    newSession.on(SessionEvents.disconnected, () => {
      this._onSessionDisconnected(newSession);
    });
    this._sessions.push(newSession);
    return newSession;
  }

  _onWebPhoneSessionRing = (webphoneSession) => {
    const [partyData] = extractHeadersData(webphoneSession.request.headers);
    let session;
    if (partyData && partyData.sessionId) {
      session = this.sessions.find(s => s.telephonySessionId === partyData.sessionId);
    }
    if (session) {
      session.setWebphoneSession(webphoneSession);
      return;
    }
    session = this._onNewWebPhoneSession(webphoneSession);
    // @ts-ignore
    this.emit('new', session);
  }

  _onNewTelephonySession = (telephonySession) => {
    let session =
      this.sessions.find(s => s.telephonySessionId === telephonySession.id);
    if (session) {
      session.setTelephonySession(telephonySession);
      return session;
    }
    session = new Session({
      telephonySession,
      webphone: this.webphone,
      activeCallControl: this.activeCallControl,
    });
    // @ts-ignore
    session.on(SessionEvents.disconnected, () => {
      this._onSessionDisconnected(session);
    });
    this._sessions.push(session);
    // @ts-ignore
    this.emit('new', session);
    return session;
  }

  _onSessionDisconnected(session) {
    this._sessions = this._sessions.filter(s => s !== session);
  }

  async dispose() {
    // TODO
    this._webphone = null;
    this._activeCallControl = null;
  }

  get webphone() {
    return this._webphone;
  }

  get activeCallControl() {
    return this._activeCallControl;
  }

  get sessions() {
    return this._sessions;
  }
}
