/* eslint-disable @typescript-eslint/naming-convention, consistent-return, jsx-a11y/no-noninteractive-tabindex */
import * as React from 'react';
import PropTypes from 'prop-types';
import { exactProp, elementAcceptingRef } from '@material-ui/utils';
import ownerDocument from '../utils/ownerDocument';
import useForkRef from '../utils/useForkRef';

const focusSelectorsRoot = [
  'input',
  'select',
  'textarea',
  'a[href]',
  'button',
  '[tabindex]',
  'audio[controls]',
  'video[controls]',
  '[contenteditable]:not([contenteditable="false"])',
  'details>summary:first-of-type',
  'details'
];

/**
 * Utility component that locks focus inside the component.
 */
function Unstable_TrapFocus(props) {
  const {
    children,
    disableAutoFocus = false,
    disableEnforceFocus = false,
    disableRestoreFocus = false,
    getDoc,
    isEnabled,
    focusSelectors = () => [],
    open,
  } = props;
  const ignoreNextEnforceFocus = React.useRef();
  const lastEvent = React.useRef(null);
  const sentinelStart = React.useRef(null);
  const sentinelEnd = React.useRef(null);
  const nodeToRestore = React.useRef();
  const reactFocusEventTarget = React.useRef(null);
  // This variable is useful when disableAutoFocus is true.
  // It waits for the active element to move into the component to activate.
  const activated = React.useRef(false);
  const rootRef = React.useRef(null);
  const handleRef = useForkRef(children.ref, rootRef);

  const prevOpenRef = React.useRef();
  React.useEffect(() => {

    const doc = ownerDocument(rootRef.current);
    
    if (!prevOpenRef.current && open && rootRef.current &&
      (
        (rootRef.current.contains(doc.activeElement) && disableAutoFocus)
        ||
        !disableAutoFocus
      ) && !ignoreNextEnforceFocus.current
    ) {

      if (!nodeToRestore.current) {
        nodeToRestore.current = doc.activeElement;
      }

      sentinelStart.current.focus();
    }

    prevOpenRef.current = open;
  }, [disableAutoFocus, open]);
  
  if (!prevOpenRef.current && open && typeof window !== 'undefined' && !disableRestoreFocus) {
    // WARNING: Potentially unsafe in concurrent mode.
    // The way the read on `nodeToRestore` is setup could make this actually safe.
    // Say we render `open={false}` -> `open={true}` but never commit.
    // We have now written a state that wasn't committed. But no committed effect
    // will read this wrong value. We only read from `nodeToRestore` in effects
    // that were committed on `open={true}`
    // WARNING: Prevents the instance from being garbage collected. Should only
    // hold a weak ref.
    nodeToRestore.current = getDoc().activeElement;
  }

  React.useEffect(() => {
    // We might render an empty child.
    if (!open || !rootRef.current) {
      return;
    }

    activated.current = !disableAutoFocus;
  }, [disableAutoFocus, open]);

  React.useEffect(() => {
    // We might render an empty child.
    if (!open || !rootRef.current) {
      return;
    }

    const doc = ownerDocument(rootRef.current);

    if (!rootRef.current.contains(doc.activeElement)) {
      if (!rootRef.current.hasAttribute('tabIndex')) {
        if (process.env.NODE_ENV !== 'production') {
          console.error(
            [
              'Material-UI: The modal content node does not accept focus.',
              'For the benefit of assistive technologies, ' +
                'the tabIndex of the node is being set to "-1".',
            ].join('\n'),
          );
        }
        rootRef.current.setAttribute('tabIndex', -1);
      }

      if (activated.current) {
        rootRef.current.focus();
      }
    }

    return () => {
      // restoreLastFocus()
      if (!disableRestoreFocus) {
        // In IE11 it is possible for document.activeElement to be null resulting
        // in nodeToRestore.current being null.
        // Not all elements in IE11 have a focus method.
        // Once IE11 support is dropped the focus() call can be unconditional.
        if (nodeToRestore.current && nodeToRestore.current.focus) {
          ignoreNextEnforceFocus.current = true;
          nodeToRestore.current.focus();
        }

        nodeToRestore.current = null;
      }
    };
    // Missing `disableRestoreFocus` which is fine.
    // We don't support changing that prop on an open TrapFocus
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const onSentinelFocus = React.useCallback((position) => () => {
    
    const isRadioTabble = (node) => {
      
      if (!node.name) {
        return true;
      }
      
      const radioScope = node.form || node.ownerDocument;
      const radioSet = radioScope.querySelectorAll(`input[type="radio"][name="${node.name}"]`);
      
      const getCheckedRadio = (nodes, form) => {
        for (let i = 0; i < nodes.length; i += 1) {
          if (nodes[i].checked && nodes[i].form === form) {
            return nodes[i];
          }
        }
      }
      
      const checked = getCheckedRadio(radioSet, node.form);
      return !checked || checked === node;

    }

    const getTabIndex = (node) => {
      
      const tabindexAttr = parseInt(node.getAttribute('tabindex'), 10);

      if (!Number.isNaN(tabindexAttr)) {
        return tabindexAttr;
      }

      if (
        node.contentEditable === 'true' ||
        (node.nodeName === 'AUDIO' ||
          node.nodeName === 'VIDEO' ||
          node.nodeName === 'DETAILS') &&
        node.getAttribute('tabindex') === null
      ) {
        return 0;
      }
    
      return node.tabIndex;
    };

    const isFocusable = (node) => {

      const isInput = nodeEl => nodeEl.tagName === 'INPUT';
      if (node.disabled || (isInput(node) && node.type === 'hidden')
      || (isInput(node) && node.type === 'radio' && !isRadioTabble(node))) {
        return false;        
      }
      return true;
    }

    const selectors = [...focusSelectorsRoot, ...focusSelectors()].filter(Boolean);
    const isShiftTab = Boolean(lastEvent.current?.shiftKey && lastEvent.current?.key === 'Tab');
    const regularTabNodes = [];
    const orderedTabNodes = [];

    Array.from(rootRef.current.querySelectorAll(selectors.join(', '))).forEach((node, i) => {
      
      const nodeTabIndex = getTabIndex(node);

      if (!isFocusable(node) || nodeTabIndex < 0) {
        return;
      }

      if (nodeTabIndex === 0) {
        regularTabNodes.push(node);
      } else {
        orderedTabNodes.push({
          documentOrder: i,
          tabIndex: nodeTabIndex,
          node,
        });
      }

    }); 

    const focusChildren = orderedTabNodes
      .sort((a, b) => a.tabIndex === b.tabIndex
        ? a.documentOrder - b.documentOrder
        : a.tabIndex - b.tabIndex)
      .map((a) => a.node)
      .concat(regularTabNodes);
    
    if (!focusChildren?.length) return rootRef.current.focus();
    const focusStart = focusChildren[0];
    const focusEnd = focusChildren[focusChildren.length - 1];

    activated.current = true;

    if (position === 'start' && isShiftTab) {
      return focusEnd.focus();
    }

    return focusStart.focus();

  }, [focusSelectors]);

  React.useEffect(() => {
    // We might render an empty child.
    if (!open || !rootRef.current) {
      return;
    }

    const doc = ownerDocument(rootRef.current);

    const contain = (nativeEvent) => {
      const { current: rootElement } = rootRef;
      // Cleanup functions are executed lazily in React 17.
      // Contain can be called between the component being unmounted and its cleanup function being run.

      if (rootElement === null) {
        return;
      }

      if (
        !doc.hasFocus() ||
        disableEnforceFocus ||
        !isEnabled() ||
        ignoreNextEnforceFocus.current
      ) {
        ignoreNextEnforceFocus.current = false;
        return;
      }

      if (!rootElement.contains(doc.activeElement)) {
        // if the focus event is not coming from inside the children's react tree, reset the refs
        if (
          (nativeEvent && reactFocusEventTarget.current !== nativeEvent.target) ||
          doc.activeElement !== reactFocusEventTarget.current
        ) {
          reactFocusEventTarget.current = null;
        } else if (reactFocusEventTarget.current !== null) {
          return;
        }

        if (!activated.current) {
          return;
        }

        rootElement.focus();

      } else {
        activated.current = true;
      }
    };

    const loopFocus = (nativeEvent) => {
      lastEvent.current = nativeEvent;

      if (disableEnforceFocus || !isEnabled() || nativeEvent.key !== 'Tab') {
        return;
      }

      // Make sure the next tab starts from the right place.
      if (doc.activeElement === rootRef.current) {
        // We need to ignore the next contain as
        // it will try to move the focus back to the rootRef element.
        ignoreNextEnforceFocus.current = true;
        if (nativeEvent.shiftKey) {
          sentinelEnd.current.focus();
        } else {
          sentinelStart.current.focus();
        }
      }
    };


    doc.addEventListener('focusin', contain);
    doc.addEventListener('keydown', loopFocus, true);

    // With Edge, Safari and Firefox, no focus related events are fired when the focused area stops being a focused area.
    // e.g. https://bugzilla.mozilla.org/show_bug.cgi?id=559561.
    // Instead, we can look if the active element was restored on the BODY element.
    //
    // The whatwg spec defines how the browser should behave but does not explicitly mention any events:
    // https://html.spec.whatwg.org/multipage/interaction.html#focus-fixup-rule.
    const interval = setInterval(() => {
      if (doc.activeElement.tagName === 'BODY') {
        contain();
      }
    }, 50);

    return () => {
      clearInterval(interval);

      doc.removeEventListener('focusin', contain);
      doc.removeEventListener('keydown', loopFocus, true);
    };
  }, [disableAutoFocus, disableEnforceFocus, disableRestoreFocus, isEnabled, open]);

  const onFocus = (event) => {

    if (!activated.current && rootRef.current && event.relatedTarget && !rootRef.current.contains(event.relatedTarget) && event.relatedTarget !== sentinelStart.current && event.relatedTarget !== sentinelEnd.current) {
      nodeToRestore.current = event.relatedTarget;
    }

    activated.current = true;
    reactFocusEventTarget.current = event.target;

    const childrenPropsHandler = children.props.onFocus;
    if (childrenPropsHandler) {
      childrenPropsHandler(event);
    }
  };

  return (
    <React.Fragment>
      <div onFocus={onSentinelFocus('start')} tabIndex={0} ref={sentinelStart} data-test="sentinelStart" />
      {React.cloneElement(children, { ref: handleRef, onFocus })}
      <div onFocus={onSentinelFocus('end')} tabIndex={0} ref={sentinelEnd} data-test="sentinelEnd" />
    </React.Fragment>
  );
}

Unstable_TrapFocus.propTypes = {
  // ----------------------------- Warning --------------------------------
  // | These PropTypes are generated from the TypeScript type definitions |
  // |     To update them edit the d.ts file and run "yarn proptypes"     |
  // ----------------------------------------------------------------------
  /**
   * A single child content element.
   */
  children: elementAcceptingRef,
  /**
   * If `true`, the trap focus will not automatically shift focus to itself when it opens, and
   * replace it to the last focused element when it closes.
   * This also works correctly with any trap focus children that have the `disableAutoFocus` prop.
   *
   * Generally this should never be set to `true` as it makes the trap focus less
   * accessible to assistive technologies, like screen readers.
   * @default false
   */
  disableAutoFocus: PropTypes.bool,
  /**
   * If `true`, the trap focus will not prevent focus from leaving the trap focus while open.
   *
   * Generally this should never be set to `true` as it makes the trap focus less
   * accessible to assistive technologies, like screen readers.
   * @default false
   */
  disableEnforceFocus: PropTypes.bool,
  /**
   * If `true`, the trap focus will not restore focus to previously focused element once
   * trap focus is hidden.
   * @default false
   */
  disableRestoreFocus: PropTypes.bool,
  /**
   * Accepts a function which returns an array of selectors 
   * to add to the component focusable elements.
   * 
   */
  focusSelectors: PropTypes.func,
  /**
   * Return the document to consider.
   * We use it to implement the restore focus between different browser documents.
   */
  getDoc: PropTypes.func.isRequired,
  /**
   * Do we still want to enforce the focus?
   * This prop helps nesting TrapFocus elements.
   */
  isEnabled: PropTypes.func.isRequired,
  /**
   * If `true`, focus is locked.
   */
  open: PropTypes.bool.isRequired,
};

if (process.env.NODE_ENV !== 'production') {
  // eslint-disable-next-line
  Unstable_TrapFocus['propTypes' + ''] = exactProp(Unstable_TrapFocus.propTypes);
}

export default Unstable_TrapFocus;
