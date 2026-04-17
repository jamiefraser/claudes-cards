// DNS records for the frontend custom domain.
// Scoped to the resource group that holds the DNS zone (may differ from apps).

param dnsZoneName string
param recordName string
@description('Default container-app FQDN (e.g. claudescards-web.xxxxx.canadacentral.azurecontainerapps.io).')
param targetFqdn string
@description('Custom-domain verification id that Container Apps generates; published as asuid TXT.')
param verificationId string

resource zone 'Microsoft.Network/dnsZones@2018-05-01' existing = {
  name: dnsZoneName
}

// CNAME: cardgames → <app>.<env>.<region>.azurecontainerapps.io
resource cnameRec 'Microsoft.Network/dnsZones/CNAME@2018-05-01' = {
  parent: zone
  name: recordName
  properties: {
    TTL: 3600
    CNAMERecord: {
      cname: targetFqdn
    }
  }
}

// TXT: asuid.cardgames = <verificationId>  (Container Apps domain ownership)
resource asuidRec 'Microsoft.Network/dnsZones/TXT@2018-05-01' = {
  parent: zone
  name: 'asuid.${recordName}'
  properties: {
    TTL: 3600
    TXTRecords: [
      {
        value: [ verificationId ]
      }
    ]
  }
}

output cnameFqdn string = '${recordName}.${dnsZoneName}'
