import _ from 'underscore';
import {
  React,
  ReactDOM,
  PropTypes,
  Utils,
  DraftHelpers,
  Actions,
  AccountStore,
} from 'mailspring-exports';
import {
  InjectedComponent,
  KeyCommandsRegion,
  ParticipantsTextField,
  ListensToFluxStore,
} from 'mailspring-component-kit';
import AccountContactField from './account-contact-field';
import CollapsedParticipants from './collapsed-participants';
import ComposerHeaderActions from './composer-header-actions';
import SubjectTextField from './subject-text-field';
import Fields from './fields';

const ScopedFromField = ListensToFluxStore(AccountContactField, {
  stores: [AccountStore],
  getStateFromStores: props => {
    const savedOrReplyToThread = !!props.draft.threadId;
    if (savedOrReplyToThread) {
      return { accounts: [AccountStore.accountForId(props.draft.accountId)] };
    }
    return { accounts: AccountStore.accounts() };
  },
});

export default class ComposerHeader extends React.Component {
  static displayName = 'ComposerHeader';

  static propTypes = {
    draft: PropTypes.object.isRequired,
    session: PropTypes.object.isRequired,
    initiallyFocused: PropTypes.bool,
    // Subject text field injected component needs to call this function
    // when it is rendered with a new header component
    onNewHeaderComponents: PropTypes.func,
  };

  static contextTypes = {
    parentTabGroup: PropTypes.object,
  };

  constructor(props = {}) {
    super(props);
    this._els = {};
    this.state = this._initialStateForDraft(this.props.draft, props);
  }

  componentWillReceiveProps(nextProps) {
    if (this.props.session !== nextProps.session) {
      this.setState(this._initialStateForDraft(nextProps.draft, nextProps));
    } else {
      this._ensureFilledFieldsEnabled(nextProps.draft);
    }
  }

  focus() {
    if (this.state.subjectFocused) {
      this._els.subject.focus();
    } else if (this.state.participantsFocused) {
      this.showAndFocusField(Fields.To);
    }
    console.warn("Nothing is marked as focused. This shouldn't happen!");
    this.showAndFocusField(Fields.To);
  }

  showAndFocusField = fieldName => {
    const enabledFields = _.uniq([].concat(this.state.enabledFields, [fieldName]));
    const participantsFocused =
      this.state.participantsFocused || Fields.ParticipantFields.includes(fieldName);

    Utils.waitFor(() => this._els[fieldName])
      .then(() => this._els[fieldName].focus())
      .catch(() => {});

    this.setState({ enabledFields, participantsFocused });
  };

  hideField = fieldName => {
    if (ReactDOM.findDOMNode(this._els[fieldName]).contains(document.activeElement)) {
      this.context.parentTabGroup.shiftFocus(-1);
    }

    const enabledFields = _.without(this.state.enabledFields, fieldName);
    this.setState({ enabledFields });
  };

  _ensureFilledFieldsEnabled(draft) {
    let enabledFields = this.state.enabledFields;
    if (!_.isEmpty(draft.cc)) {
      enabledFields = enabledFields.concat([Fields.Cc]);
    }
    if (!_.isEmpty(draft.bcc)) {
      enabledFields = enabledFields.concat([Fields.Bcc]);
    }
    if (enabledFields !== this.state.enabledFields) {
      this.setState({ enabledFields });
    }
  }

  _initialStateForDraft(draft, props) {
    const enabledFields = [Fields.To];
    if (!_.isEmpty(draft.cc)) {
      enabledFields.push(Fields.Cc);
    }
    if (!_.isEmpty(draft.bcc)) {
      enabledFields.push(Fields.Bcc);
    }
    enabledFields.push(Fields.From);
    if (this._shouldEnableSubject()) {
      enabledFields.push(Fields.Subject);
    }

    return {
      enabledFields,
      participantsFocused: props.initiallyFocused,
      subjectFocused: false,
    };
  }

  _shouldEnableSubject = () => {
    if (_.isEmpty(this.props.draft.subject)) {
      return true;
    }
    if (DraftHelpers.isForwardedMessage(this.props.draft)) {
      return true;
    }
    if (this.props.draft.replyToHeaderMessageId) {
      return false;
    }
    return true;
  };

  _onChangeParticipants = changes => {
    this.props.session.changes.add(changes);
    Actions.draftParticipantsChanged(this.props.draft.id, changes);
  };

  _onSubjectChange = value => {
    this.props.session.changes.add({ subject: value });
  };

  _onFocusInParticipants = () => {
    const fieldName = this.state.participantsLastActiveField || Fields.To;
    Utils.waitFor(() => this._els[fieldName])
      .then(() => this._els[fieldName].focus())
      .catch(() => {});

    this.setState({
      participantsFocused: true,
      participantsLastActiveField: null,
    });
  };

  _onFocusOutParticipants = lastFocusedEl => {
    const active = Fields.ParticipantFields.find(fieldName => {
      return this._els[fieldName]
        ? ReactDOM.findDOMNode(this._els[fieldName]).contains(lastFocusedEl)
        : false;
    });
    this.setState({
      participantsFocused: false,
      participantsLastActiveField: active,
    });
  };

  _onFocusInSubject = () => {
    this.setState({
      subjectFocused: true,
    });
  };

  _onFocusOutSubject = () => {
    this.setState({
      subjectFocused: false,
    });
  };

  isFocused() {
    return this.state.participantsFocused || this.state.subjectFocused;
  }

  _onDragCollapsedParticipants = ({ isDropping }) => {
    if (isDropping) {
      this.setState({
        participantsFocused: true,
        enabledFields: [...Fields.ParticipantFields, Fields.From, Fields.Subject],
      });
    }
  };

  _renderParticipants = () => {
    let content = null;
    if (this.state.participantsFocused) {
      content = this._renderFields();
    } else {
      content = (
        <CollapsedParticipants
          to={this.props.draft.to}
          cc={this.props.draft.cc}
          bcc={this.props.draft.bcc}
          onDragChange={this._onDragCollapsedParticipants}
        />
      );
    }

    // When the participants field collapses, we store the field that was last
    // focused onto our state, so that we can restore focus to it when the fields
    // are expanded again.
    return (
      <KeyCommandsRegion
        tabIndex={-1}
        ref={el => {
          if (el) {
            this._els.participantsContainer = el;
          }
        }}
        className="expanded-participants"
        onFocusIn={this._onFocusInParticipants}
        onFocusOut={this._onFocusOutParticipants}
      >
        {content}
      </KeyCommandsRegion>
    );
  };

  _renderSubject = () => {
    if (!this.state.enabledFields.includes(Fields.Subject)) {
      return false;
    }
    const { draft, session } = this.props;
    return (
      <KeyCommandsRegion
        tabIndex={-1}
        ref={el => {
          if (el) {
            this._els.subjectContainer = el;
          }
        }}
        onFocusIn={this._onFocusInSubject}
        onFocusOut={this._onFocusOutSubject}
      >
        <InjectedComponent
          ref={el => {
            if (el) {
              this._els[Fields.Subject] = el;
            }
          }}
          key="subject-wrap"
          matching={{ role: 'Composer:SubjectTextField' }}
          exposedProps={{
            draft,
            session,
            value: draft.subject,
            headerMessageId: draft.headerMessageId,
            onSubjectChange: this._onSubjectChange,
          }}
          requiredMethods={['focus']}
          fallback={SubjectTextField}
          onComponentDidChange={this.props.onNewHeaderComponents}
        />
      </KeyCommandsRegion>
    );
  };

  _renderFields = () => {
    const { to, cc, bcc, from } = this.props.draft;

    // Note: We need to physically add and remove these elements, not just hide them.
    // If they're hidden, shift-tab between fields breaks.
    const fields = [];

    fields.push(
      <ParticipantsTextField
        ref={el => {
          if (el) {
            this._els[Fields.To] = el;
          }
        }}
        key="to"
        field="to"
        change={this._onChangeParticipants}
        className="composer-participant-field to-field"
        participants={{ to, cc, bcc }}
        draft={this.props.draft}
        session={this.props.session}
      />
    );

    if (this.state.enabledFields.includes(Fields.Cc)) {
      fields.push(
        <ParticipantsTextField
          ref={el => {
            if (el) {
              this._els[Fields.Cc] = el;
            }
          }}
          key="cc"
          field="cc"
          change={this._onChangeParticipants}
          onEmptied={() => this.hideField(Fields.Cc)}
          className="composer-participant-field cc-field"
          participants={{ to, cc, bcc }}
          draft={this.props.draft}
          session={this.props.session}
        />
      );
    }

    if (this.state.enabledFields.includes(Fields.Bcc)) {
      fields.push(
        <ParticipantsTextField
          ref={el => {
            if (el) {
              this._els[Fields.Bcc] = el;
            }
          }}
          key="bcc"
          field="bcc"
          change={this._onChangeParticipants}
          onEmptied={() => this.hideField(Fields.Bcc)}
          className="composer-participant-field bcc-field"
          participants={{ to, cc, bcc }}
          draft={this.props.draft}
          session={this.props.session}
        />
      );
    }

    if (this.state.enabledFields.includes(Fields.From)) {
      fields.push(
        <ScopedFromField
          key="from"
          ref={el => {
            if (el) {
              this._els[Fields.From] = el;
            }
          }}
          value={from[0]}
          draft={this.props.draft}
          session={this.props.session}
          onChange={this._onChangeParticipants}
        />
      );
    }

    return fields;
  };

  render() {
    return (
      <div className="composer-header">
        <ComposerHeaderActions
          headerMessageId={this.props.draft.headerMessageId}
          enabledFields={this.state.enabledFields}
          participantsFocused={this.state.participantsFocused}
          onShowAndFocusField={this.showAndFocusField}
        />
        {this._renderParticipants()}
        {this._renderSubject()}
      </div>
    );
  }
}