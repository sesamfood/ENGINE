# Integrations

The application must work with every integration disabled. Organizations enable
providers from the integrations grid and configure them on dedicated subpages.
The grid is the discovery point for disabled integrations. Other pages must hide
provider-specific controls, navigation, and help until the provider is enabled.

Each organization supplies its own provider credentials. Provider configuration
must not depend on application environment variables containing integration keys.

Provider code belongs together wherever the framework permits. Shared application
code owns business records and calls explicit integration entry points. Disabling
a provider stops its external work without deleting imported business records.

Existing connections, mappings, permissions, and operational behavior must survive
changes to the integration structure.
