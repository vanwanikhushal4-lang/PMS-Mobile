import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { AuthError, type Grant } from '../../../../scm/auth-api';
import { authClient } from '../../../../scm/auth-config';
import { useProtectedRead } from '../../../../scm/protected-read';
import type { FormC } from '../../../../scm/publishing-contract';
import { FormMessage, Phase, TextAction } from '../../../../ui/Access';
import { BrandedTopBar } from '../../../../ui/Brand';
import { Action, DetailRecord, Screen, type } from '../../../../ui/Primitives';
import { WorkspaceTabs } from '../../../../ui/Workspace';
import { color } from '../../../../ui/theme';

const tabs = ['Order', 'Form C', 'Tasks'];

export default function PurchaseOrderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const orderId = typeof id === 'string' && /^[1-9]\d{0,9}$/.test(id) && Number(id) <= 2_147_483_647 ? Number(id) : 0;
  const [pane, setPane] = useState({ index: 0, shift: 0 });
  const read = useCallback((grant: Grant, signal: AbortSignal) => {
    if (!orderId) return Promise.reject(new AuthError('not-found'));
    if (!authClient) return Promise.reject(new AuthError('unavailable'));
    return authClient.publishOrder(grant, orderId, signal);
  }, [orderId]);
  const { result, reload } = useProtectedRead(read);
  const detail = result.kind === 'ready' ? result.data : null;

  return <Screen workspace>
    <BrandedTopBar>
      <TextAction label="Purchase orders" onPress={() => router.canGoBack() ? router.back() : router.replace('/projects/publishing')} />
    </BrandedTopBar>
    <View style={styles.content}>
      {result.kind === 'loading' ? <Text accessibilityLiveRegion="polite" style={type.caption}>Loading purchase order…</Text> : null}
      {result.kind === 'error' ? <OrderError code={result.code} reload={reload} /> : null}
      {detail ? <Phase>
        <View style={styles.heading}>
          <Text style={type.eyebrow}>{detail.item.customer}</Text>
          <Text accessibilityRole="header" style={type.title}>{detail.item.reference}</Text>
          {detail.item.status ? <Text style={type.body}>{detail.item.status}</Text> : null}
        </View>
        <WorkspaceTabs labels={tabs} index={pane.index} onSelect={(index) => setPane((current) => index === current.index
          ? current : { index, shift: 16 * Math.sign(index - current.index) })} />
        <Phase key={pane.index} shift={pane.shift}>
          {pane.index === 0 ? <>
            <DetailRecord rows={[
              ['Purchase order number', detail.item.number], ['Purchase date', detail.item.date], ['Product suite', detail.item.suite],
              ['Product tool', detail.item.tool], ['Product license', detail.item.license], ['Payment terms', detail.item.paymentTerms],
              ['Form C status', detail.item.formStatus],
            ]} />
            {detail.item.projectId ? <Action label="Open project workspace" secondary
              onPress={() => router.push({ pathname: '/projects/[id]', params: { id: String(detail.item.projectId) } })} /> : null}
          </> : null}
          {pane.index === 1 ? detail.formC ? <Implementation form={detail.formC} /> : <Text style={type.body}>No Form C is linked to this order.</Text> : null}
          {pane.index === 2 ? <OrderTasks orderId={orderId} /> : null}
        </Phase>
      </Phase> : null}
    </View>
  </Screen>;
}

function Implementation({ form }: { form: FormC }) {
  const contacts = [
    ['Sales manager', form.salesManager], ['Customer implementor', form.implementor], ['Implementor phone', form.implementorPhone],
    ['Implementor email', form.implementorEmail], ['End customer', form.endCustomer], ['End customer phone', form.endCustomerPhone],
  ] as const;
  return <>
    {form.project ? <Text accessibilityRole="header" style={styles.section}>{form.project}</Text> : null}
    <DetailRecord rows={[['Form C status', form.status], ['Form date', form.date], ['Product license', form.license]]} />
    {contacts.some(([, value]) => value) ? <>
      <Text accessibilityRole="header" style={styles.section}>Contacts</Text>
      <DetailRecord rows={contacts.filter(([, value]) => value)} />
    </> : null}
    <Text accessibilityRole="header" style={styles.section}>Implementation milestones</Text>
    {form.milestones.length ? <View style={styles.rows}>
      {form.milestones.map((milestone) => <View key={milestone.name} style={styles.card}>
        <Text style={styles.label}>{milestone.name}</Text>
        {milestone.description ? <Text style={type.body}>{milestone.description}</Text> : null}
        {milestone.responsibility ? <Text style={type.caption}>{milestone.responsibility}</Text> : null}
        {milestone.start || milestone.due ? <Text style={type.caption}>
          {[milestone.start && 'Start ' + milestone.start, milestone.due && 'Due ' + milestone.due].filter(Boolean).join(' · ')}
        </Text> : null}
      </View>)}
    </View> : <Text style={type.body}>No milestones are recorded on this form.</Text>}
  </>;
}

function OrderTasks({ orderId }: { orderId: number }) {
  const [pages, setPages] = useState<number[]>([]);
  const before = pages.at(-1);
  const read = useCallback((grant: Grant, signal: AbortSignal) => authClient
    ? authClient.publishOrderTasks(grant, orderId, before, signal)
    : Promise.reject(new AuthError('unavailable')), [before, orderId]);
  const { result, reload } = useProtectedRead(read);
  if (result.kind === 'loading') return <Text accessibilityLiveRegion="polite" style={type.caption}>Loading tasks…</Text>;
  if (result.kind === 'error') return <OrderError code={result.code} reload={reload} />;
  const { items, next } = result.data;
  return <Phase key={before ?? 'first'} shift={10}>
    {items.length ? <View style={styles.rows}>
      {items.map((task) => <View key={task.id} style={styles.card}>
        <Text style={type.eyebrow}>{['T-' + task.id, task.status].filter(Boolean).join(' · ')}</Text>
        <Text style={styles.label}>{task.module || 'Unnamed task'}</Text>
        {task.description ? <Text style={type.body}>{task.description}</Text> : null}
        {[task.function, task.developer, task.assignedAt].some(Boolean) ? <Text style={type.caption}>
          {[task.function, task.developer, task.assignedAt].filter(Boolean).join(' · ')}
        </Text> : null}
      </View>)}
    </View> : <Text style={type.body}>No visible tasks match this order’s customer and product.</Text>}
    {before || next ? <View style={styles.actions}>
      {before ? <Action label="Previous page" icon="back" secondary onPress={() => setPages(pages.slice(0, -1))} /> : null}
      {next ? <Action label="Next page" secondary onPress={() => setPages([...pages, next])} /> : null}
    </View> : null}
  </Phase>;
}

function OrderError({ code, reload }: { code?: AuthError['code']; reload: () => void }) {
  const unavailable = code === 'forbidden' || code === 'not-found';
  return <>
    <FormMessage message={unavailable ? 'This purchase order is unavailable to your account.' : 'Couldn’t load this purchase order.'} />
    {unavailable ? null : <TextAction label="Try again" onPress={reload} />}
  </>;
}

const styles = StyleSheet.create({
  content: { marginTop: 12, gap: 16 },
  heading: { gap: 8 },
  section: { color: color.text, fontSize: 19, fontWeight: '600' },
  rows: { gap: 8 },
  card: { borderWidth: 1, borderColor: color.edge, borderRadius: 8, backgroundColor: color.panel, padding: 12, gap: 6 },
  label: { color: color.text, fontSize: 16, fontWeight: '600' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
