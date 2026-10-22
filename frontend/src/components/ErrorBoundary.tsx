// Copyright 2024 VoteChain Contributors
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import React, { Component, createRef, ErrorInfo, ReactNode } from "react";
import i18n from "../i18n";

interface Props {
  children: ReactNode;
  /** Optional section name for monitoring context */
  section?: string;
}

interface State {
  error: Error | null;
}

const GITHUB_ISSUES_URL =
  "https://github.com/veracindarella/votechain-contracts/issues/new?template=bug_report.yml";

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  /** Ref to the fallback region so focus can be moved there on error */
  private fallbackRef = createRef<HTMLDivElement>();

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Log to monitoring service (replace with real integration, e.g. Sentry)
    console.error(
      `[ErrorBoundary]${this.props.section ? ` [${this.props.section}]` : ""}`,
      error,
      info.componentStack,
    );
  }

  componentDidUpdate(_prevProps: Props, prevState: State): void {
    // Move focus to the fallback region when an error is first caught
    if (!prevState.error && this.state.error && this.fallbackRef.current) {
      this.fallbackRef.current.focus();
    }
  }

  private handleRetry = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    const { error } = this.state;
    const { section } = this.props;

    if (error) {
      return (
        <div
          ref={this.fallbackRef}
          role="alert"
          tabIndex={-1}
          style={{ padding: "1.5rem", textAlign: "center" }}
        >
          <h2>{i18n.t("app.somethingWentWrong")}</h2>
          <p>
            {this.props.section
              ? i18n.t("app.sectionError", { section: this.props.section })
              : i18n.t("app.unexpectedError")}
          </p>
          <button onClick={this.handleRetry}>{i18n.t("app.tryAgain")}</button>
        </div>
      );
    }

    return this.props.children;
  }
}
