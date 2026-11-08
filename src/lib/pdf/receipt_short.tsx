import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import type { ReceiptData } from "./receipt";

const styles = StyleSheet.create({
  page: { padding: 18, fontSize: 9 },
  row: { flexDirection: "row", justifyContent: "space-between", marginTop: 1 },
  bold: { fontFamily: "Helvetica-Bold" },
  divider: { marginTop: 3, marginBottom: 3, borderBottom: "1px solid #000" },
});

export function ReceiptShortDocument({ data }: { data: ReceiptData }) {
  return (
    <Document>
      <Page size={{ width: 220, height: 600 }} style={styles.page}>
        <Text style={[styles.bold, { textAlign: "center" }]}>{data.company}</Text>
        <Text style={{ textAlign: "center", marginBottom: 6 }}>#{data.saleId} {data.saleTime}</Text>
        <View style={styles.divider} />
        {data.lines.map((l, i) => (
          <View key={i} style={styles.row}>
            <Text>{l.description.slice(0, 24)} ×{l.quantity}</Text>
            <Text>{(l.total ?? l.unitPrice * l.quantity).toFixed(2)}</Text>
          </View>
        ))}
        <View style={styles.divider} />
        <View style={[styles.row, styles.bold]}>
          <Text>Total</Text>
          <Text>{data.total.toFixed(2)}</Text>
        </View>
        {data.payments.map((p, i) => (
          <View key={i} style={styles.row}>
            <Text>{p.type}</Text>
            <Text>{p.amount.toFixed(2)}</Text>
          </View>
        ))}
      </Page>
    </Document>
  );
}