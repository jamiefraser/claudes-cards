// Card Platform — Azure infrastructure (one file, idempotent).
//
// What this creates (in claudes-cards-rg):
//   - Log Analytics workspace           (workspace for CAE logs, pay-as-you-go)
//   - Azure Container Registry          (Basic SKU, admin disabled, AAD pull)
//   - Azure Database for PostgreSQL     (Flexible Server, Burstable B1ms)
//   - Azure Cache for Redis             (Basic C0)
//   - Container Apps Environment        (Consumption profile)
//   - User-assigned managed identity    (CAE → ACR pull)
//   - 4 Container Apps                  (api, socket, worker, frontend)
//   - Managed TLS cert + custom domain  (frontend only)
//   - DNS records in existing zone      (CNAME + asuid TXT for frontend)
//
// Cost at idle (~USD/mo): PG ~$13, Redis ~$17, Container Apps ~$0, ACR ~$5,
// Log Analytics ~$2 (minimal ingestion) → ~$37/mo baseline.

@description('Azure region. All resources land in the same region.')
param location string = 'canadacentral'

@description('DNS zone that already hosts relevanttechnologyservices.com.')
param dnsZoneName string = 'relevanttechnologyservices.com'

@description('Subdomain (relative to the zone) that fronts the web app.')
param frontendSubdomain string = 'cardgames'

@description('Short project slug used in resource names.')
param projectSlug string = 'claudescards'

@description('Postgres admin user.')
param pgAdminUser string = 'cardsadmin'

@description('Postgres admin password. Provide via pipeline secret.')
@secure()
param pgAdminPassword string

@description('JWT secret used by dev auth mode. Not used in production auth mode, but the app reads it at startup.')
@secure()
param jwtSecret string

@description('AAD B2C authority URL (VITE_B2C_AUTHORITY).')
param b2cAuthority string = 'https://cards.b2clogin.com/cards.onmicrosoft.com/B2C_1_SUSI'

@description('AAD B2C client id (VITE_B2C_CLIENT_ID).')
param b2cClientId string = '096195ca-be77-44f5-9a5b-40e154f2ca46'

@description('AAD B2C known authorities (comma-separated).')
param b2cKnownAuthorities string = 'cards.b2clogin.com'

@description('Image tag to deploy for every service. CD pipeline overrides this.')
param imageTag string = 'latest'

@description('Placeholder image used for initial container-app creation. The deploy workflow rolls real ACR-built images in afterwards via `az containerapp update`. This avoids a chicken-and-egg where bicep references an ACR tag that doesn\'t exist yet (MANIFEST_UNKNOWN) and the container-app provisioning hangs on an image pull that will never succeed.')
param bootstrapImage string = 'mcr.microsoft.com/k8se/quickstart:latest'

// ── Derived names ────────────────────────────────────────────────────────────
var acrName          = toLower('${projectSlug}acr')
// ACR login servers follow a stable convention (<name>.azurecr.io). Computing
// the value from the name rather than via `acr.properties.loginServer` avoids
// a runtime `reference()` call that the Container Apps RP fails to resolve at
// template-validation time, surfacing as "invalid image format" with the raw
// ARM expression in the error message.
var acrLoginServerVal = '${acrName}.azurecr.io'
var logAnalyticsName = '${projectSlug}-logs'
var caeName          = '${projectSlug}-cae'
var pgServerName     = '${projectSlug}-pg'
var pgDbName         = 'card_platform'
var redisName        = '${projectSlug}-redis'
var umiName          = '${projectSlug}-umi'
var apiAppName       = '${projectSlug}-api'
var socketAppName    = '${projectSlug}-socket'
var workerAppName    = '${projectSlug}-worker'
var frontendAppName  = '${projectSlug}-web'
var customFqdn       = '${frontendSubdomain}.${dnsZoneName}'

// ── Log Analytics (workspace for Container Apps logs) ────────────────────────
resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2022-10-01' = {
  name: logAnalyticsName
  location: location
  properties: {
    sku: { name: 'PerGB2018' }
    retentionInDays: 30
  }
}

// ── Container Registry (Basic, AAD-pull via managed identity) ────────────────
resource acr 'Microsoft.ContainerRegistry/registries@2023-11-01-preview' = {
  name: acrName
  location: location
  sku: { name: 'Basic' }
  properties: {
    adminUserEnabled: false
  }
}

// ── User-assigned managed identity (CAE → ACR pull) ──────────────────────────
resource umi 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: umiName
  location: location
}

// AcrPull role assignment on the ACR for the UMI.
resource acrPullRole 'Microsoft.Authorization/roleDefinitions@2022-04-01' existing = {
  scope: subscription()
  name: '7f951dda-4ed3-4680-a7ca-43fe172d538d' // AcrPull (built-in)
}
resource acrPullAssign 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: acr
  name: guid(acr.id, umi.id, acrPullRole.id)
  properties: {
    principalId: umi.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: acrPullRole.id
  }
}

// ── Postgres Flexible Server (Burstable B1ms) ───────────────────────────────
resource pg 'Microsoft.DBforPostgreSQL/flexibleServers@2023-06-01-preview' = {
  name: pgServerName
  location: location
  sku: {
    name: 'Standard_B1ms'
    tier: 'Burstable'
  }
  properties: {
    version: '16'
    administratorLogin: pgAdminUser
    administratorLoginPassword: pgAdminPassword
    storage: {
      storageSizeGB: 32
      autoGrow: 'Disabled'
    }
    backup: {
      backupRetentionDays: 7
      geoRedundantBackup: 'Disabled'
    }
    highAvailability: {
      mode: 'Disabled'
    }
    network: {
      publicNetworkAccess: 'Enabled'
    }
  }
}

// Allow all Azure services (the CAE lives in a Microsoft-managed subnet we
// can't pin; broader firewall is fine for a single-tenant dev deployment).
resource pgFwAzure 'Microsoft.DBforPostgreSQL/flexibleServers/firewallRules@2023-06-01-preview' = {
  parent: pg
  name: 'AllowAllAzureServices'
  properties: {
    startIpAddress: '0.0.0.0'
    endIpAddress: '0.0.0.0'
  }
}

resource pgDatabase 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2023-06-01-preview' = {
  parent: pg
  name: pgDbName
  properties: {
    charset: 'UTF8'
    collation: 'en_US.utf8'
  }
}

// ── Redis Basic C0 ───────────────────────────────────────────────────────────
resource redis 'Microsoft.Cache/redis@2024-03-01' = {
  name: redisName
  location: location
  properties: {
    sku: {
      name: 'Basic'
      family: 'C'
      capacity: 0
    }
    enableNonSslPort: false
    redisVersion: '6'
    minimumTlsVersion: '1.2'
  }
}

// ── Container Apps Environment ───────────────────────────────────────────────
resource cae 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: caeName
  location: location
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logAnalytics.properties.customerId
        sharedKey: logAnalytics.listKeys().primarySharedKey
      }
    }
    workloadProfiles: [
      {
        name: 'Consumption'
        workloadProfileType: 'Consumption'
      }
    ]
  }
}

// ── Connection strings built from above resources ────────────────────────────
var pgFqdn      = '${pgServerName}.postgres.database.azure.com'
var databaseUrl = 'postgresql://${pgAdminUser}:${uriComponent(pgAdminPassword)}@${pgFqdn}:5432/${pgDbName}?schema=public&sslmode=require'
var redisUrl    = 'rediss://:${redis.listKeys().primaryKey}@${redis.properties.hostName}:${redis.properties.sslPort}'

// Default FQDNs that will eventually exist for each container app.
var apiFqdn      = '${apiAppName}.${cae.properties.defaultDomain}'
var socketFqdn   = '${socketAppName}.${cae.properties.defaultDomain}'
var webFqdn      = '${frontendAppName}.${cae.properties.defaultDomain}'
var corsOrigin   = 'https://${customFqdn},https://${webFqdn}'

// ── API service ──────────────────────────────────────────────────────────────
resource apiApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: apiAppName
  location: location
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${umi.id}': {}
    }
  }
  properties: {
    managedEnvironmentId: cae.id
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: true
        targetPort: 3001
        transport: 'auto'
        allowInsecure: false
        corsPolicy: {
          allowedOrigins: [ 'https://${customFqdn}', 'https://${webFqdn}' ]
          allowedMethods: [ 'GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS' ]
          allowedHeaders: [ '*' ]
          allowCredentials: true
        }
      }
      registries: [
        {
          server: acrLoginServerVal
          identity: umi.id
        }
      ]
      secrets: [
        { name: 'database-url', value: databaseUrl }
        { name: 'redis-url', value: redisUrl }
        { name: 'jwt-secret', value: jwtSecret }
      ]
    }
    template: {
      containers: [
        {
          name: 'api'
          image: bootstrapImage
          resources: { cpu: json('0.5'), memory: '1Gi' }
          env: [
            { name: 'NODE_ENV', value: 'production' }
            { name: 'AUTH_MODE', value: 'production' }
            { name: 'TEST_MODE', value: 'false' }
            { name: 'API_PORT', value: '3001' }
            { name: 'DATABASE_URL', secretRef: 'database-url' }
            { name: 'REDIS_URL', secretRef: 'redis-url' }
            { name: 'JWT_SECRET', secretRef: 'jwt-secret' }
            { name: 'B2C_AUTHORITY', value: b2cAuthority }
            { name: 'B2C_CLIENT_ID', value: b2cClientId }
            { name: 'LOG_LEVEL', value: 'info' }
            { name: 'CORS_ORIGIN', value: corsOrigin }
            { name: 'NODE_OPTIONS', value: '--dns-result-order=ipv4first' }
          ]
        }
      ]
      scale: { minReplicas: 1, maxReplicas: 3 }
    }
  }
  dependsOn: [ acrPullAssign, pgDatabase ]
}

// ── Socket service ───────────────────────────────────────────────────────────
resource socketApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: socketAppName
  location: location
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${umi.id}': {}
    }
  }
  properties: {
    managedEnvironmentId: cae.id
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: true
        targetPort: 3002
        transport: 'auto'
        allowInsecure: false
        stickySessions: {
          affinity: 'sticky'
        }
        corsPolicy: {
          allowedOrigins: [ 'https://${customFqdn}', 'https://${webFqdn}' ]
          allowedMethods: [ 'GET', 'POST', 'OPTIONS' ]
          allowedHeaders: [ '*' ]
          allowCredentials: true
        }
      }
      registries: [
        {
          server: acrLoginServerVal
          identity: umi.id
        }
      ]
      secrets: [
        { name: 'redis-url', value: redisUrl }
        { name: 'jwt-secret', value: jwtSecret }
      ]
    }
    template: {
      containers: [
        {
          name: 'socket'
          image: bootstrapImage
          resources: { cpu: json('0.5'), memory: '1Gi' }
          env: [
            { name: 'NODE_ENV', value: 'production' }
            { name: 'AUTH_MODE', value: 'production' }
            { name: 'SOCKET_PORT', value: '3002' }
            { name: 'REDIS_URL', secretRef: 'redis-url' }
            { name: 'JWT_SECRET', secretRef: 'jwt-secret' }
            { name: 'B2C_AUTHORITY', value: b2cAuthority }
            { name: 'B2C_CLIENT_ID', value: b2cClientId }
            { name: 'API_INTERNAL_URL', value: 'https://${apiFqdn}/api/v1' }
            { name: 'CORS_ORIGIN', value: corsOrigin }
            { name: 'LOG_LEVEL', value: 'info' }
            { name: 'NODE_OPTIONS', value: '--dns-result-order=ipv4first' }
          ]
        }
      ]
      scale: { minReplicas: 1, maxReplicas: 3 }
    }
  }
  dependsOn: [ acrPullAssign ]
}

// ── Worker service (internal only, no ingress) ───────────────────────────────
resource workerApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: workerAppName
  location: location
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${umi.id}': {}
    }
  }
  properties: {
    managedEnvironmentId: cae.id
    configuration: {
      activeRevisionsMode: 'Single'
      registries: [
        {
          server: acrLoginServerVal
          identity: umi.id
        }
      ]
      secrets: [
        { name: 'database-url', value: databaseUrl }
        { name: 'redis-url', value: redisUrl }
      ]
    }
    template: {
      containers: [
        {
          name: 'worker'
          image: bootstrapImage
          resources: { cpu: json('0.25'), memory: '0.5Gi' }
          env: [
            { name: 'NODE_ENV', value: 'production' }
            { name: 'DATABASE_URL', secretRef: 'database-url' }
            { name: 'REDIS_URL', secretRef: 'redis-url' }
            { name: 'LOG_LEVEL', value: 'info' }
            { name: 'NODE_OPTIONS', value: '--dns-result-order=ipv4first' }
          ]
        }
      ]
      scale: { minReplicas: 1, maxReplicas: 1 }
    }
  }
  dependsOn: [ acrPullAssign ]
}

// ── Frontend (nginx, custom domain, managed TLS) ─────────────────────────────
resource frontendApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: frontendAppName
  location: location
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${umi.id}': {}
    }
  }
  properties: {
    managedEnvironmentId: cae.id
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: true
        targetPort: 80
        transport: 'auto'
        allowInsecure: false
      }
      registries: [
        {
          server: acrLoginServerVal
          identity: umi.id
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'web'
          image: bootstrapImage
          resources: { cpu: json('0.25'), memory: '0.5Gi' }
        }
      ]
      scale: { minReplicas: 1, maxReplicas: 3 }
    }
  }
  dependsOn: [ acrPullAssign ]
}

// NOTE: DNS records (CNAME + asuid TXT) AND the managed certificate + hostname
// binding for the custom domain are handled *outside* bicep, by the deploy
// workflow. Reasons:
//
//   * Writing DNS records via a bicep module requires Microsoft.Resources/
//     deployments/write on the zone's resource group, which would force us to
//     grant Contributor on that RG. Writing them directly via `az network dns
//     record-set *` only needs DNS Zone Contributor on the zone itself.
//
//   * Managed cert issuance needs DNS to be in place AND propagated before the
//     CAE can validate. Stepping DNS → cert → hostname bind in the workflow
//     lets us insert small waits between them; a monolithic bicep deploy does
//     not wait and routinely fails the cert step on first run.

// ── Outputs (consumed by the deploy workflow) ────────────────────────────────
output acrLoginServer  string = acrLoginServerVal
output acrName         string = acr.name
output apiAppName      string = apiApp.name
output socketAppName   string = socketApp.name
output workerAppName   string = workerApp.name
output frontendAppName string = frontendApp.name
output apiFqdn         string = apiFqdn
output socketFqdn      string = socketFqdn
output webFqdn         string = webFqdn
output customFqdn      string = customFqdn
output caeDefaultDomain string = cae.properties.defaultDomain
