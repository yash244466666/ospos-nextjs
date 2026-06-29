import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import type { ReceiptData } from "./receipt";

const styles = StyleSheet.create({
  page: { padding: 36, fontSize: 10 },
  bold: { fontFamily: "Helvetica-Bold" },
  header: { flexDirection: "row", justifyContent: "space-between", marginBottom: 12 },
  title: { fontSize: 18, fontFamily: "Helvetica-Bold" },
  meta: { marginBottom: 12 },
  row: { flexDirection: "row", marginTop: 2 },
  colDesc: { width: "55%" },
  colHsn: { width: "15%" },
  colQty: { width: "10%", textAlign: "right" },
  colPrice: { width: "10%", textAlign: "right" },
  colTotal: { width: "10%", textAlign: "right" },
  divider: { marginTop: 4, marginBottom: 4, borderBottom: "1px solid #000" },
  totalsRow: { flexDirection: "row", justifyContent: "flex-end", marginTop: 2 },
});

export function TaxInvoiceDocument({ data }: { data: ReceiptData }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>{data.company}</Text>
            <Text>{data.address}</Text>
            <Text>{data.phone}</Text>
          </View>
          <View>
            <Text style={styles.bold}>TAX INVOICE</Text>
            <Text>#{data.saleId}</Text>
            <Text>{data.saleTime}</Text>
          </View>
        </View>
        <View style={styles.meta}>
          <Text>Bill To: {data.customerName}</Text>
        </View>
        <View style={styles.divider} />
        <View style={[styles.row, styles.bold]}>
          <Text style={styles.colDesc}>Description</Text>
          <Text style={styles.colHsn}>HSN</Text>
          <Text style={styles.colQty}>Qty</Text>
          <Text style={styles.colPrice}>Price</Text>
          <Text style={styles.colTotal}>Total</Text>
        </View>
        <View style={styles.divider} />
        {data.lines.map((l, i) => (
          <View key={i} style={styles.row}>
            <Text style={styles.colDesc}>{l.description}</Text>
            <Text style={styles.colHsn}>—</Text>
            <Text style={styles.colQty}>{l.quantity}</Text>
            <Text style={styles.colPrice}>{l.unitPrice.toFixed(2)}</Text>
            <Text style={styles.colTotal}>{(l.unitPrice * l.quantity).toFixed(2)}</Text>
          </View>
        ))}
        <View style={styles.divider} />
        {data.taxes.map((t, i) => (
          <View key={i} style={styles.totalsRow}>
            <Text>Tax {t.name}: {t.amount.toFixed(2)}</Text>
          </View>
        ))}
        <View style={[styles.totalsRow, styles.bold]}>
          <Text>Grand Total: {data.total.toFixed(2)}</Text>
        </View>
      </Page>
    </Document>
  );
}