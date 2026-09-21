import { useEffect, useRef, useState } from 'react';
import { keyError } from './validation';
export interface KeyFormProps {
 readonly configured: boolean; readonly busy: boolean; readonly ready: boolean;
 readonly save: (key: string) => Promise<boolean>; readonly remove: () => Promise<boolean>;
}
export function useKeyForm({ configured, busy, ready, save, remove }: KeyFormProps) {
 const [editing, setEditing] = useState(false);
 const [key, setKey] = useState('');
 const [validation, setValidation] = useState('');
 const [confirming, setConfirming] = useState(false);
 const input = useRef<HTMLInputElement>(null);
 const changeButton = useRef<HTMLButtonElement>(null);
 const deleteButton = useRef<HTMLButtonElement>(null);
 const confirmBox = useRef<HTMLDivElement>(null);
 const focusChange = useRef(false);
 const wasConfigured = useRef(configured);
 useEffect(() => { if (confirming) confirmBox.current?.focus(); }, [confirming]);
 useEffect(() => {
  if (editing) input.current?.focus();
  else if (focusChange.current && configured) { changeButton.current?.focus(); focusChange.current = false; }
 }, [editing, configured]);
 const submit = async (event: React.FormEvent<HTMLFormElement>) => {
  event.preventDefault(); if (busy || !ready) return;
  const error = keyError(key); setValidation(error); if (error) { input.current?.focus(); return; }
  const result = save(key); setKey(''); // Clear input state immediately after dispatch, including failed connections.
  if (await result) { focusChange.current = true; setEditing(false); }
 };
 const cancelDelete = () => { setConfirming(false); deleteButton.current?.focus(); };
 const confirmDelete = async () => {
  if (busy) return;
  if (await remove()) { setConfirming(false); setEditing(false); setKey(''); }
 };
 useEffect(() => {
  if (wasConfigured.current && !configured) input.current?.focus();
  wasConfigured.current = configured;
 }, [configured]);
 const cancelEdit = () => { focusChange.current = true; setEditing(false); setKey(''); setValidation(''); };
 return { editing, setEditing, key, setKey, validation, setValidation, confirming, setConfirming, input, changeButton, deleteButton, confirmBox, submit, cancelDelete, confirmDelete, cancelEdit };
}
