## Dependencies: Demo Mode 0.2.0-beta.9 on App Server 5

- Demo Mode moves to 0.2.0-beta.9: in a demo, an anonymous visitor who opens a link to a signed-in page enters as the demo administrator and lands on that page, as the home page already did.
- NocoBase moves to App Server 5.0.0-beta.1, App Client 4.0.0-beta.8, Agents 2.0.0-beta.5, Authentication 2.0.0-beta.19, Authorization 1.0.0-beta.36, Users 2.0.0-beta.15 and the plugin releases that accept them. App Server 5 sends mail through its own named mailers; NocoReach configures none, so nothing changes in what it sends.
- A signed-in user's language choice is now saved with the account and follows it to other browsers; a choice made only in a browser before this release is not carried over, and such accounts start in the application's default language.
- Runners installed with an earlier CLI need `nocoreach acp service restart` once after `nocoreach update`.
